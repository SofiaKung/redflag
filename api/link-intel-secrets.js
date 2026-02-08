import { getLinkIntelSecrets } from '../server/linkIntelSecrets.js';
import { applyRateLimit, attachRateLimitHeaders } from '../server/rateLimit.js';
import {
  getClientIp,
  isRequestOriginAllowed,
  validatePublicHttpUrl,
} from '../server/requestGuards.js';

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

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
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
    routeKey: 'link_intel',
    clientKey: getClientIp(req),
  });
  attachRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const payload = parseJsonBody(req.body);
  const url = payload?.url;
  const domain = payload?.domain;

  if (typeof domain !== 'string' || domain.length === 0 || !isValidHttpUrl(url)) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const urlValidation = await validatePublicHttpUrl(url);
  if (!urlValidation.ok) {
    res.status(400).json({ error: urlValidation.reason || 'Unsafe URL' });
    return;
  }

  try {
    const result = await getLinkIntelSecrets({
      url: urlValidation.normalizedUrl || url,
      domain,
      safeBrowsingApiKey: process.env.SAFE_BROWSING_API_KEY || process.env.GEMINI_API_KEY || '',
      whoisApiKey: process.env.WHOIS_API_KEY || '',
    });
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Secret intel request failed';
    res.status(502).json({ error: message });
  }
}
