/**
 * Google Safe Browsing v4 — checks URL against known threats.
 * Requires SAFE_BROWSING_API_KEY (or falls back to GEMINI_API_KEY).
 */

export async function safeBrowsing({ url }, env) {
  const apiKey = (env.SAFE_BROWSING_API_KEY || env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return { threats: [], clean: true, success: false, error: 'No API key' };
  }

  try {
    const body = {
      client: { clientId: 'redflag', clientVersion: '1.0' },
      threatInfo: {
        threatTypes: [
          'MALWARE',
          'SOCIAL_ENGINEERING',
          'UNWANTED_SOFTWARE',
          'POTENTIALLY_HARMFUL_APPLICATION',
        ],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url }],
      },
    };

    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      return { threats: [], clean: true, success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const threats = Array.isArray(data?.matches)
      ? data.matches.map((m) => m?.threatType).filter((t) => typeof t === 'string')
      : [];

    return {
      threats,
      clean: threats.length === 0,
      success: true,
    };
  } catch (err) {
    return { threats: [], clean: true, success: false, error: err?.message || 'Request failed' };
  }
}
