import { analyzeContent } from '../server/analyzeHandler.js';
import { logAnalysis } from '../server/supabase.js';
import { logError } from '../server/supabase.js';
import { applyRateLimit, attachRateLimitHeaders } from '../server/rateLimit.js';
import { getClientIp, isRequestOriginAllowed } from '../server/requestGuards.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

function parseJsonBody(body) {
  if (!body) return null;
  if (typeof body === 'object') return body;
  if (typeof body !== 'string') return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function deriveErrorInputType(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.url === 'string' && payload.url.trim()) return 'url';
  if (Array.isArray(payload.imagesBase64) && payload.imagesBase64.length > 0) return 'screenshot';
  if (typeof payload.text === 'string' && payload.text.trim()) return 'text';
  return null;
}

function logAnalyzeApiError(errorMessage, payload, apiMode = null) {
  logError({
    error: errorMessage,
    rawResponse: null,
    url: typeof payload?.url === 'string' ? payload.url : null,
    inputType: deriveErrorInputType(payload),
    apiMode,
    responseTimeMs: null,
  }, process.env).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    logAnalyzeApiError('Method not allowed', null);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isRequestOriginAllowed(req)) {
    logAnalyzeApiError('Forbidden origin', null);
    res.status(403).json({ error: 'Forbidden origin' });
    return;
  }

  const rateLimit = applyRateLimit({
    routeKey: 'analyze',
    clientKey: getClientIp(req),
  });
  attachRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    logAnalyzeApiError('Rate limit exceeded', null);
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const payload = parseJsonBody(req.body);
  if (!payload || typeof payload !== 'object') {
    logAnalyzeApiError('Invalid JSON payload', null);
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const { url, text, imagesBase64, userLanguage, userCountryCode, source } = payload;

  if (!url && !text && (!imagesBase64 || imagesBase64.length === 0)) {
    logAnalyzeApiError('Must provide url, text, or imagesBase64', payload);
    res.status(400).json({ error: 'Must provide url, text, or imagesBase64' });
    return;
  }

  if (typeof userLanguage !== 'string' || !userLanguage.trim()) {
    logAnalyzeApiError('userLanguage is required', payload);
    res.status(400).json({ error: 'userLanguage is required' });
    return;
  }

  try {
    const urlInput = typeof url === 'string' ? url : undefined;
    const textInput = typeof text === 'string' ? text : undefined;
    const imagesInput = Array.isArray(imagesBase64) ? imagesBase64 : undefined;

    const { result, mode, responseTimeMs } = await analyzeContent({
      url: urlInput,
      text: textInput,
      imagesBase64: imagesInput,
      userLanguage,
      userCountryCode: typeof userCountryCode === 'string' ? userCountryCode : undefined,
      env: process.env,
    });

    // Determine inputType from source
    const inputType = source === 'qr' ? 'scanqr'
      : source === 'link' ? 'link'
      : source === 'screenshot' ? 'screenshot'
      : urlInput ? 'url' : imagesInput?.length ? 'screenshot' : 'text';

    // For link checks, the extracted URL lives in the result's linkMetadata
    const loggedUrl = urlInput || result?.linkMetadata?.analyzedUrl || undefined;

    // Fire-and-forget: log to Supabase (don't block response)
    const analysisIdPromise = logAnalysis({
      inputType,
      url: loggedUrl,
      text: textInput,
      screenshotBase64: imagesInput?.[0],
      apiMode: mode,
      responseTimeMs,
      result,
      userCountryCode: typeof userCountryCode === 'string' ? userCountryCode : undefined,
    }, process.env).catch(() => null);

    // Wait briefly for the ID so we can return it, but don't block too long
    const analysisId = await Promise.race([
      analysisIdPromise,
      new Promise(resolve => setTimeout(() => resolve(null), 2000)),
    ]);

    res.status(200).json({ ...result, analysisId, apiMode: mode, responseTimeMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    console.error('Analyze error:', message);
    logAnalyzeApiError(message, payload, process.env.USE_AGENTIC_API === 'true' ? 'agentic' : 'legacy');
    res.status(502).json({ error: message });
  }
}
