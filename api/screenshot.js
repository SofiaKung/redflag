const BROWSERLESS_BASE_URL = 'https://production-sfo.browserless.io/screenshot';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Server is missing BROWSERLESS_TOKEN' });
    return;
  }

  const payload = parseJsonBody(req.body);
  const targetUrl = payload?.url;

  if (!targetUrl || !isValidHttpUrl(targetUrl)) {
    res.status(400).json({ error: 'Invalid or missing URL' });
    return;
  }

  try {
    const upstream = await fetch(`${BROWSERLESS_BASE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ error: text || 'Screenshot capture failed' });
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
