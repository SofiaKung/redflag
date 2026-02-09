import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { runGeminiGenerate } from './server/geminiProxy.js';
import { getLinkIntelSecrets } from './server/linkIntelSecrets.js';
import { analyzeContent as _analyzeContent } from './server/analyzeHandler.js';
import { logAnalysis as _logAnalysis, submitFeedback as _submitFeedback } from './server/supabase.js';
import { applyRateLimit } from './server/rateLimit.js';
import {
  getClientIp,
  isRequestOriginAllowed,
  validatePublicHttpUrl,
} from './server/requestGuards.js';

const analyzeContentServer = _analyzeContent as (opts: {
  url?: string; text?: string; imagesBase64?: string[]; userLanguage: string; userCountryCode?: string; env: Record<string, string>;
}) => Promise<{ result: any; mode: string; responseTimeMs: number }>;
const logAnalysisServer = _logAnalysis as (data: Record<string, any>, env: Record<string, string>) => Promise<string | null>;
const submitFeedbackServer = _submitFeedback as (id: string, feedback: string, env: Record<string, string>) => Promise<boolean>;

const readRequestBody = (req: any): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer | string) => {
      data += chunk.toString();
      if (data.length > 25_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const sendJson = (res: any, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const sendRateLimitHeaders = (res: any, rateLimit: any) => {
  res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetAt / 1000)));
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSec));
  }
};

const parseJson = (raw: string): any | null => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const isValidHttpUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const secretApiDevPlugin = (env: Record<string, string>) => ({
  name: 'secret-api-dev-plugin',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: () => void) => {
      const urlPath = (req.url || '').split('?')[0];
      const rateLimitClientKey = getClientIp(req);

      if (req.method === 'POST' && urlPath === '/api/gemini') {
        if (!isRequestOriginAllowed(req)) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }

        const rateLimit = applyRateLimit({
          routeKey: 'gemini',
          clientKey: rateLimitClientKey,
        });
        sendRateLimitHeaders(res, rateLimit);
        if (!rateLimit.allowed) {
          sendJson(res, 429, { error: 'Rate limit exceeded' });
          return;
        }

        const apiKey = env.GEMINI_API_KEY || '';
        if (!apiKey) {
          sendJson(res, 500, { error: 'Server is missing GEMINI_API_KEY' });
          return;
        }

        try {
          const body = parseJson(await readRequestBody(req));
          if (!body || typeof body !== 'object') {
            sendJson(res, 400, { error: 'Invalid JSON payload' });
            return;
          }

          const text = await runGeminiGenerate({
            apiKey,
            model: body.model,
            contents: body.contents,
            config: body.config,
          });
          sendJson(res, 200, { text });
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Gemini request failed';
          sendJson(res, 502, { error: message });
          return;
        }
      }

      if (req.method === 'POST' && urlPath === '/api/link-intel-secrets') {
        if (!isRequestOriginAllowed(req)) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }

        const rateLimit = applyRateLimit({
          routeKey: 'link_intel',
          clientKey: rateLimitClientKey,
        });
        sendRateLimitHeaders(res, rateLimit);
        if (!rateLimit.allowed) {
          sendJson(res, 429, { error: 'Rate limit exceeded' });
          return;
        }

        try {
          const body = parseJson(await readRequestBody(req));
          const requestUrl = body?.url;
          const domain = body?.domain;

          if (!isValidHttpUrl(requestUrl) || typeof domain !== 'string' || domain.length === 0) {
            sendJson(res, 400, { error: 'Invalid payload' });
            return;
          }

          const urlValidation = await validatePublicHttpUrl(requestUrl);
          if (!urlValidation.ok) {
            sendJson(res, 400, { error: urlValidation.reason || 'Unsafe URL' });
            return;
          }

          const result = await getLinkIntelSecrets({
            url: urlValidation.normalizedUrl || requestUrl,
            domain,
            safeBrowsingApiKey: env.SAFE_BROWSING_API_KEY || env.GEMINI_API_KEY || '',
            whoisApiKey: env.WHOIS_API_KEY || '',
          });

          sendJson(res, 200, result);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Secret intel request failed';
          sendJson(res, 502, { error: message });
          return;
        }
      }

      // ---- /api/analyze ----
      if (req.method === 'POST' && urlPath === '/api/analyze') {
        if (!isRequestOriginAllowed(req)) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }

        const rateLimit = applyRateLimit({
          routeKey: 'analyze',
          clientKey: rateLimitClientKey,
        });
        sendRateLimitHeaders(res, rateLimit);
        if (!rateLimit.allowed) {
          sendJson(res, 429, { error: 'Rate limit exceeded' });
          return;
        }

        try {
          const body = parseJson(await readRequestBody(req));
          if (!body || typeof body !== 'object') {
            sendJson(res, 400, { error: 'Invalid JSON payload' });
            return;
          }

          const { url: reqUrl, text: reqText, imagesBase64, userLanguage, userCountryCode } = body;
          if (!reqUrl && !reqText && (!imagesBase64 || !imagesBase64.length)) {
            sendJson(res, 400, { error: 'Must provide url, text, or imagesBase64' });
            return;
          }
          if (typeof userLanguage !== 'string' || !userLanguage.trim()) {
            sendJson(res, 400, { error: 'userLanguage is required' });
            return;
          }

          const urlInput = typeof reqUrl === 'string' ? reqUrl : undefined;
          const textInput = typeof reqText === 'string' ? reqText : undefined;
          const imagesInput = Array.isArray(imagesBase64) ? imagesBase64 : undefined;
          const countryCode = typeof userCountryCode === 'string' ? userCountryCode : undefined;

          const { result, mode, responseTimeMs } = await analyzeContentServer({
            url: urlInput,
            text: textInput,
            imagesBase64: imagesInput,
            userLanguage,
            userCountryCode: countryCode,
            env,
          });

          // Fire-and-forget: log to Supabase
          const analysisIdPromise = logAnalysisServer({
            inputType: urlInput ? 'url' : imagesInput?.length ? 'screenshot' : 'text',
            url: urlInput,
            text: textInput,
            screenshotBase64: imagesInput?.[0],
            apiMode: mode,
            responseTimeMs,
            result,
            userCountryCode: countryCode,
          }, env).catch(() => null);

          const analysisId = await Promise.race([
            analysisIdPromise,
            new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
          ]);

          sendJson(res, 200, { ...(result as object), analysisId, apiMode: mode, responseTimeMs });
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Analysis failed';
          console.error('Analyze error:', message);
          sendJson(res, 502, { error: message });
          return;
        }
      }

      // ---- /api/feedback ----
      if (req.method === 'POST' && urlPath === '/api/feedback') {
        try {
          const body = parseJson(await readRequestBody(req));
          if (!body || typeof body !== 'object') {
            sendJson(res, 400, { error: 'Invalid JSON payload' });
            return;
          }

          const { analysisId, feedback } = body;
          if (typeof analysisId !== 'string' || !analysisId) {
            sendJson(res, 400, { error: 'analysisId is required' });
            return;
          }
          if (feedback !== 'correct' && feedback !== 'incorrect') {
            sendJson(res, 400, { error: 'feedback must be "correct" or "incorrect"' });
            return;
          }

          const ok = await submitFeedbackServer(analysisId, feedback, env);
          sendJson(res, ok ? 200 : 500, ok ? { success: true } : { error: 'Failed to save feedback' });
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Feedback failed';
          sendJson(res, 500, { error: message });
          return;
        }
      }

      next();
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/screenshot': {
            target: `https://production-sfo.browserless.io`,
            changeOrigin: true,
            rewrite: (_path: string) => `/screenshot?token=${encodeURIComponent(env.BROWSERLESS_TOKEN || '')}`,
          },
        },
      },
      plugins: [react(), secretApiDevPlugin(env)],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
