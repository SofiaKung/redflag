function cleanWhoisValue(value) {
  if (!value || typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  if (lower.includes('redacted') || lower.includes('not available') || lower.trim() === '') return null;
  return value;
}

async function checkSafeBrowsing(url, apiKey) {
  if (!apiKey) return { threats: [], success: false };
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
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) return { threats: [], success: false };
    const data = await response.json();
    const threats = Array.isArray(data?.matches)
      ? data.matches.map((match) => match?.threatType).filter((threatType) => typeof threatType === 'string')
      : [];
    return { threats, success: true };
  } catch {
    return { threats: [], success: false };
  }
}

async function whoisLookup(domain, apiKey) {
  if (!apiKey) return null;
  try {
    const response = await fetch(
      `https://api.whoxy.com/?key=${encodeURIComponent(apiKey)}&whois=${encodeURIComponent(domain)}`
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (data?.status !== 1) return null;

    const registrant = data.registrant_contact || {};
    const registrar = data.domain_registrar || {};
    const orgLower = (registrant.company_name || '').toLowerCase();
    const nameLower = (registrant.full_name || '').toLowerCase();
    const privacyKeywords = [
      'privacy',
      'proxy',
      'whoisguard',
      'domains by proxy',
      'withheld',
      'private',
      'redacted',
      'data protected',
    ];
    const privacyProtected =
      privacyKeywords.some((keyword) => orgLower.includes(keyword) || nameLower.includes(keyword)) ||
      data.domain_registered === 'no';

    return {
      registrantName: cleanWhoisValue(registrant.full_name),
      registrantOrg: cleanWhoisValue(registrant.company_name),
      registrantStreet: cleanWhoisValue(registrant.mailing_address),
      registrantCity: cleanWhoisValue(registrant.city_name),
      registrantState: cleanWhoisValue(registrant.state_name),
      registrantPostalCode: cleanWhoisValue(registrant.zip_code),
      registrantCountry: registrant.country_name || registrant.country_code || null,
      registrantEmail: cleanWhoisValue(registrant.email_address),
      registrantTelephone: cleanWhoisValue(registrant.phone_number),
      registrarName: typeof registrar.registrar_name === 'string' ? registrar.registrar_name : null,
      whoisCreatedDate: typeof data.create_date === 'string' ? data.create_date : null,
      privacyProtected,
    };
  } catch {
    return null;
  }
}

export async function getLinkIntelSecrets({
  url,
  domain,
  safeBrowsingApiKey,
  whoisApiKey,
}) {
  const [safeBrowsingResult, whois] = await Promise.all([
    checkSafeBrowsing(url, safeBrowsingApiKey),
    whoisLookup(domain, whoisApiKey),
  ]);

  return {
    safeBrowsingThreats: safeBrowsingResult.threats,
    safeBrowsingSuccess: safeBrowsingResult.success,
    whois,
  };
}
