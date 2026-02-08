import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { runGeminiGenerate } from './server/geminiProxy.js';
import { getLinkIntelSecrets } from './server/linkIntelSecrets.js';
import { applyRateLimit } from './server/rateLimit.js';
import {
  getClientIp,
  isRequestOriginAllowed,
  validatePublicHttpUrl,
} from './server/requestGuards.js';

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
