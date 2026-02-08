import { applyRateLimit, attachRateLimitHeaders } from '../server/rateLimit.js';
import {
  getClientIp,
  isRequestOriginAllowed,
  validatePublicHttpUrl,
} from '../server/requestGuards.js';

const BROWSERLESS_BASE_URL = 'https://production-sfo.browserless.io/screenshot';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJsonBody(body) {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (typeof body === 'object') return body;
  return null;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeIncomingUrl(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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
    routeKey: 'screenshot',
    clientKey: getClientIp(req),
  });
  attachRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Server is missing BROWSERLESS_TOKEN' });
    return;
  }

  const payload = parseJsonBody(req.body);
  const targetUrl = normalizeIncomingUrl(payload?.url);

  if (!targetUrl || !isValidHttpUrl(targetUrl)) {
    res.status(400).json({ error: 'Invalid or missing URL' });
    return;
  }

  const urlValidation = await validatePublicHttpUrl(targetUrl);
  if (!urlValidation.ok) {
    res.status(400).json({ error: urlValidation.reason || 'Unsafe URL' });
    return;
  }

  try {
    const forwardedPayload = { ...payload, url: urlValidation.normalizedUrl || targetUrl };
    const maxAttempts = 2;
    let upstream = null;
    let lastStatus = 0;
    let retryAfterSec = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      upstream = await fetch(`${BROWSERLESS_BASE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forwardedPayload),
      });

      if (upstream.ok) break;

      lastStatus = upstream.status;
      const retryHeader = upstream.headers.get('Retry-After');
      retryAfterSec = retryHeader ? Number.parseInt(retryHeader, 10) : 0;
      await upstream.text(); // consume body

      const shouldRetry = lastStatus === 429 && attempt < maxAttempts;
      if (shouldRetry) {
        const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : 1500;
        await sleep(Math.min(backoffMs, 5000));
        continue;
      }
      break;
    }

    if (!upstream || !upstream.ok) {
      if (lastStatus === 429) {
        if (retryAfterSec > 0) res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({ error: 'Preview rate-limited by screenshot provider. Please retry shortly.' });
        return;
      }
      res.status(lastStatus || 502).json({ error: 'Screenshot capture failed' });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const imageBuffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(imageBuffer);
  } catch {
    res.status(502).json({ error: 'Failed to reach screenshot service' });
  }
}
