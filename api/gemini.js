import { runGeminiGenerate } from '../server/geminiProxy.js';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isRequestOriginAllowed(req)) {
    res.status(403).json({ error: 'Forbidden origin' });
    return;
  }

  const rateLimit = applyRateLimit({
    routeKey: 'gemini',
    clientKey: getClientIp(req),
  });
  attachRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const payload = parseJsonBody(req.body);
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
    return;
  }

  try {
    const text = await runGeminiGenerate({
      apiKey,
      model: payload.model,
      contents: payload.contents,
      config: payload.config,
    });
    res.status(200).json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed';
    res.status(502).json({ error: message });
  }
}
