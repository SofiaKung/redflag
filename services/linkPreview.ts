
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

/**
 * Captures a mobile-viewport screenshot of the target URL via Browserless.io.
 * Returns a base64-encoded PNG string, or null with an error message on failure.
 */
export const generateLinkPreview = async (targetUrl: string): Promise<LinkPreviewResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(SCREENSHOT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        url: targetUrl,
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
      return { imageBase64: null, error: 'Preview unavailable' };
    }

    const buffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    return { imageBase64: base64, error: null };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { imageBase64: null, error: 'Preview timed out' };
    }
    return { imageBase64: null, error: 'Preview unavailable' };
  } finally {
    clearTimeout(timeout);
  }
};
