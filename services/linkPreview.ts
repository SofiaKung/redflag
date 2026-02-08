
/**
 * Safe Link Preview Service
 *
 * Uses a same-origin backend endpoint to capture a screenshot of a target URL
 * without the user's device ever visiting the site directly.
 */

// Default endpoint works with local Vite proxy and serverless deployments (e.g. /api/screenshot).
// Override with VITE_SCREENSHOT_ENDPOINT if your backend route differs.
const SCREENSHOT_ENDPOINT = import.meta.env.VITE_SCREENSHOT_ENDPOINT || '/api/screenshot';

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export interface LinkPreviewResult {
  imageBase64: string | null;
  error: string | null;
}

const previewCache = new Map<string, { result: LinkPreviewResult; expiresAt: number }>();
const inflightPreviewRequests = new Map<string, Promise<LinkPreviewResult>>();
const SUCCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 15 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePreviewUrl = (rawUrl: string): string | null => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // QR payloads often omit protocol (e.g. "example.com/path")
  return `https://${trimmed}`;
};

const getCachedPreview = (url: string): LinkPreviewResult | null => {
  const entry = previewCache.get(url);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    previewCache.delete(url);
    return null;
  }
  return entry.result;
};

const setCachedPreview = (url: string, result: LinkPreviewResult) => {
  previewCache.set(url, {
    result,
    expiresAt: Date.now() + (result.imageBase64 ? SUCCESS_CACHE_TTL_MS : ERROR_CACHE_TTL_MS),
  });
};

const normalizePreviewError = (status: number, body: string): string => {
  if (status === 429 || /too many requests/i.test(body)) {
    return 'Preview rate-limited. Please retry in a few seconds.';
  }
  if (status === 403) {
    return 'Preview blocked by origin policy.';
  }
  if (status >= 500) {
    return 'Preview service is temporarily unavailable.';
  }
  return 'Preview unavailable';
};

const requestPreviewOnce = async (normalizedUrl: string): Promise<{ ok: true; base64: string } | { ok: false; status: number; error: string; retryAfterMs: number }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(SCREENSHOT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        url: normalizedUrl,
        options: {
          type: 'png',
          fullPage: false,
        },
        gotoOptions: {
          waitUntil: 'networkidle0',
          timeout: 15000,
        },
        viewport: {
          width: 390,
          height: 844,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        },
        setExtraHTTPHeaders: { 'User-Agent': MOBILE_USER_AGENT },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) * 1000 : 0;
      return {
        ok: false,
        status: response.status,
        error: normalizePreviewError(response.status, errorText || ''),
        retryAfterMs: Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0,
      };
    }

    const buffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    return { ok: true, base64 };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, status: 408, error: 'Preview timed out', retryAfterMs: 0 };
    }
    return { ok: false, status: 0, error: 'Preview unavailable', retryAfterMs: 0 };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchPreviewWithRetry = async (normalizedUrl: string): Promise<LinkPreviewResult> => {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptResult = await requestPreviewOnce(normalizedUrl);

    if (attemptResult.ok) {
      return { imageBase64: attemptResult.base64, error: null };
    }

    const shouldRetry = attemptResult.status === 429 && attempt < maxAttempts;
    if (shouldRetry) {
      const backoffMs = attemptResult.retryAfterMs > 0 ? attemptResult.retryAfterMs : 1500;
      await sleep(Math.min(backoffMs, 5000));
      continue;
    }

    return { imageBase64: null, error: attemptResult.error };
  }

  return { imageBase64: null, error: 'Preview unavailable' };
};

/**
 * Captures a mobile-viewport screenshot of the target URL via Browserless.io.
 * Returns a base64-encoded PNG string, or null with an error message on failure.
 */
export const generateLinkPreview = async (targetUrl: string): Promise<LinkPreviewResult> => {
  const normalizedUrl = normalizePreviewUrl(targetUrl);
  if (!normalizedUrl) {
    return { imageBase64: null, error: 'Invalid URL format' };
  }

  const cached = getCachedPreview(normalizedUrl);
  if (cached) return cached;

  const inflight = inflightPreviewRequests.get(normalizedUrl);
  if (inflight) return inflight;

  const request = fetchPreviewWithRetry(normalizedUrl)
    .then((result) => {
      setCachedPreview(normalizedUrl, result);
      return result;
    })
    .finally(() => {
      inflightPreviewRequests.delete(normalizedUrl);
    });

  inflightPreviewRequests.set(normalizedUrl, request);
  return request;
};

export const clearLinkPreviewCache = () => {
  previewCache.clear();
  inflightPreviewRequests.clear();
};
