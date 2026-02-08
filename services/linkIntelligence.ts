
/**
 * linkIntelligence.ts
 *
 * Real technical checks for URL analysis — no AI guessing.
 * All APIs used are browser-compatible (CORS-friendly) and free-tier.
 *
 * Layers:
 *  1. DNS Resolution → Google DNS-over-HTTPS
 *  2. GeoIP Lookup → ip-api.com
 *  3. Domain Age → RDAP (IANA standard, replaces WHOIS)
 *  4. Homograph/Punycode Detection → Pure JS
 *  5. Redirect Chain → fetch with manual redirect
 *  6. Google Safe Browsing → REST API (requires enabling)
 */

export interface GeoMismatch {
  detected: boolean;
  severity: 'high' | 'medium' | 'low' | 'none';
  details: string[];
}

export interface RealLinkIntelligence {
  // DNS & Network
  resolvedIp: string | null;
  serverCountry: string | null;
  serverCity: string | null;
  isp: string | null;

  // Domain Registration
  domainAge: string | null;
  registrationDate: string | null;
  registrar: string | null;

  // WHOIS Registrant
  registrantName: string | null;
  registrantOrg: string | null;
  registrantStreet: string | null;
  registrantCity: string | null;
  registrantState: string | null;
  registrantPostalCode: string | null;
  registrantCountry: string | null;
  registrantEmail: string | null;
  registrantTelephone: string | null;
  privacyProtected: boolean;

  // Geo-Mismatch
  geoMismatch: GeoMismatch;

  // Security
  homographAttack: boolean;
  hasPunycode: boolean;

  // Redirect Chain
  finalUrl: string | null;
  redirectCount: number;

  // Safe Browsing
  safeBrowsingThreats: string[];

  // Meta
  checksCompleted: string[];
  checksFailed: string[];
}

// ============================================
// CHECK 1: DNS Resolution via Google DNS-over-HTTPS
// ============================================
async function resolveDNS(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.Answer?.[0]?.data || null;
  } catch {
    return null;
  }
}

// ============================================
// CHECK 2: GeoIP via ipwho.is (HTTPS, CORS-friendly)
// ============================================
interface GeoIPResult {
  country: string;
  city: string;
  isp: string;
  org: string;
}

async function lookupGeoIP(ip: string): Promise<GeoIPResult | null> {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success === false) return null;

    const country = typeof data.country === 'string' ? data.country : null;
    if (!country) return null;

    return {
      country,
      city: typeof data.city === 'string' ? data.city : '',
      isp: typeof data.connection?.isp === 'string' ? data.connection.isp : '',
      org: typeof data.connection?.org === 'string' ? data.connection.org : '',
    };
  } catch {
    return null;
  }
}

// ============================================
// CHECK 3: Domain Age via RDAP (IANA standard)
// ============================================

// Cache the RDAP bootstrap data
let rdapBootstrap: any = null;

async function getRdapServer(tld: string): Promise<string | null> {
  try {
    if (!rdapBootstrap) {
      const res = await fetch('https://data.iana.org/rdap/dns.json');
      if (!res.ok) return null;
      rdapBootstrap = await res.json();
    }

    for (const entry of rdapBootstrap.services) {
      if (entry[0].includes(tld)) {
        return entry[1][0];
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface RdapResult {
  registrationDate: string | null;
  registrar: string | null;
  // Registrant data (from registrar RDAP referral)
  registrantName: string | null;
  registrantOrg: string | null;
  registrantStreet: string | null;
  registrantCity: string | null;
  registrantState: string | null;
  registrantPostalCode: string | null;
  registrantCountry: string | null;
  registrantEmail: string | null;
  registrantTelephone: string | null;
  privacyProtected: boolean;
}

// Parse registrant vcard from RDAP entity
function parseRegistrantFromEntities(entities: any[]): Omit<RdapResult, 'registrationDate' | 'registrar'> {
  const empty = {
    registrantName: null, registrantOrg: null, registrantStreet: null,
    registrantCity: null, registrantState: null, registrantPostalCode: null,
    registrantCountry: null, registrantEmail: null, registrantTelephone: null,
    privacyProtected: false,
  };

  for (const entity of entities) {
    if (!entity.roles?.includes('registrant')) continue;
    const vcard = entity.vcardArray?.[1];
    if (!vcard) continue;

    let name: string | null = null;
    let org: string | null = null;
    let street: string | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let postalCode: string | null = null;
    let country: string | null = null;
    let email: string | null = null;
    let tel: string | null = null;

    for (const field of vcard) {
      const [type, , , value] = field;
      if (type === 'fn' && value) name = value;
      if (type === 'org' && value) org = value;
      if (type === 'email' && value) email = value;
      if (type === 'tel') tel = (typeof value === 'string' ? value : null)?.replace(/^tel:/, '') || null;
      if (type === 'adr' && Array.isArray(value)) {
        // vcard adr: [pobox, ext, street, city, state, postal, country]
        street = value[2] || null;
        city = value[3] || null;
        state = value[4] || null;
        postalCode = value[5] || null;
        country = value[6] || null;
      }
    }

    // Filter out empty/redacted values
    const clean = (val: string | null): string | null => {
      if (!val || val.trim() === '') return null;
      const lower = val.toLowerCase();
      if (lower.includes('redacted for privacy') && lower.length < 30) return null;
      return val;
    };

    // Detect privacy protection
    const orgLower = (org || '').toLowerCase();
    const nameLower = (name || '').toLowerCase();
    const privacyKeywords = ['privacy', 'proxy', 'whoisguard', 'domains by proxy', 'withheld', 'private', 'data protected'];
    const privacyProtected = privacyKeywords.some(kw => orgLower.includes(kw) || nameLower.includes(kw));

    return {
      registrantName: clean(name),
      registrantOrg: org || null, // Keep org even if privacy proxy (for detection)
      registrantStreet: clean(street),
      registrantCity: clean(city),
      registrantState: clean(state),
      registrantPostalCode: clean(postalCode),
      registrantCountry: clean(country),
      registrantEmail: email || null, // Keep email even if privacy proxy
      registrantTelephone: tel || null,
      privacyProtected,
    };
  }

  return empty;
}

async function rdapLookup(domain: string): Promise<RdapResult | null> {
  try {
    const tld = domain.split('.').pop();
    if (!tld) return null;

    const server = await getRdapServer(tld);
    if (!server) return null;

    const res = await fetch(`${server}domain/${domain}`, {
      headers: { 'Accept': 'application/rdap+json' }
    });
    if (!res.ok) return null;

    const data = await res.json();

    const events = data.events || [];
    const registration = events.find((e: any) => e.eventAction === 'registration');

    // Extract registrar from entities
    let registrar: string | null = null;
    const entities = data.entities || [];
    for (const entity of entities) {
      if (entity.roles?.includes('registrar')) {
        registrar = entity.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3]
          || entity.handle
          || null;
        break;
      }
    }

    // Try to get registrant from registry response first
    let registrant = parseRegistrantFromEntities(entities);

    // If no registrant data, follow the registrar RDAP referral link
    if (!registrant.registrantOrg && !registrant.registrantName) {
      const relatedLink = (data.links || []).find(
        (l: any) => l.rel === 'related' && l.href?.includes('/domain/')
      );
      if (relatedLink?.href) {
        try {
          const registrarRes = await fetch(relatedLink.href, {
            headers: { 'Accept': 'application/rdap+json' }
          });
          if (registrarRes.ok) {
            const registrarData = await registrarRes.json();
            registrant = parseRegistrantFromEntities(registrarData.entities || []);
            // Also grab registration date from registrar if not already set
            if (!registration) {
              const regEvents = registrarData.events || [];
              const regEvt = regEvents.find((e: any) => e.eventAction === 'registration');
              if (regEvt?.eventDate) {
                return {
                  registrationDate: regEvt.eventDate,
                  registrar,
                  ...registrant,
                };
              }
            }
          }
        } catch {
          // Registrar RDAP failed, continue with what we have
        }
      }
    }

    return {
      registrationDate: registration?.eventDate || null,
      registrar,
      ...registrant,
    };
  } catch {
    return null;
  }
}

function formatDomainAge(registrationDate: string): string {
  try {
    const regDate = new Date(registrationDate);
    const now = new Date();
    const diffMs = now.getTime() - regDate.getTime();

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (hours < 24) return `${hours} hours`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''}`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''}`;
    if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
    return `${years} year${years > 1 ? 's' : ''}`;
  } catch {
    return 'Unknown';
  }
}

// ============================================
// CHECK 4: Homograph / Punycode Detection
// ============================================
interface HomographResult {
  hasPunycode: boolean;
  hasCyrillic: boolean;
  hasZeroWidth: boolean;
  hasMixedScript: boolean;
  isHomograph: boolean;
}

function checkHomograph(hostname: string): HomographResult {
  const hasPunycode = hostname.includes('xn--');
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicPattern.test(hostname);
  const zeroWidth = /[\u200B\u200C\u200D\uFEFF]/;
  const hasZeroWidth = zeroWidth.test(hostname);

  // Mixed script detection (Latin + non-Latin in same label)
  const latinPattern = /[a-zA-Z]/;
  const nonLatinPattern = /[^\x00-\x7F]/;
  const hasMixedScript = latinPattern.test(hostname) && nonLatinPattern.test(hostname);

  return {
    hasPunycode,
    hasCyrillic,
    hasZeroWidth,
    hasMixedScript,
    isHomograph: hasPunycode || hasCyrillic || hasZeroWidth || hasMixedScript,
  };
}

// ============================================
// CHECK 5: Redirect Chain (follow redirects)
// ============================================
async function followRedirects(url: string): Promise<{ finalUrl: string; count: number }> {
  try {
    // Use fetch with redirect: 'follow' and check the response URL
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const finalUrl = res.url;
    const redirected = res.redirected;

    return {
      finalUrl: finalUrl !== url ? finalUrl : url,
      count: redirected ? 1 : 0, // Browser doesn't expose exact count
    };
  } catch {
    return { finalUrl: url, count: 0 };
  }
}

// ============================================
// CHECK 6: Google Safe Browsing API
// ============================================
async function checkSafeBrowsing(url: string, apiKey: string): Promise<string[]> {
  try {
    const body = {
      client: { clientId: "redflag", clientVersion: "1.0" },
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE",
          "POTENTIALLY_HARMFUL_APPLICATION",
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    };

    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const matches = data.matches || [];
    return matches.map((m: any) => m.threatType as string);
  } catch {
    return [];
  }
}

// ============================================
// CHECK 7: WHOIS via Whoxy (CORS-friendly)
// ============================================
interface WhoisResult {
  registrantName: string | null;
  registrantOrg: string | null;
  registrantStreet: string | null;
  registrantCity: string | null;
  registrantState: string | null;
  registrantPostalCode: string | null;
  registrantCountry: string | null;
  registrantEmail: string | null;
  registrantTelephone: string | null;
  registrarName: string | null;
  whoisCreatedDate: string | null;
  privacyProtected: boolean;
}

async function whoisLookup(domain: string, apiKey: string): Promise<WhoisResult | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.whoxy.com/?key=${apiKey}&whois=${encodeURIComponent(domain)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1) return null;

    const registrant = data.registrant_contact || {};
    const registrar = data.domain_registrar || {};

    // Filter out redacted/privacy placeholder values
    const clean = (val: string | undefined): string | null => {
      if (!val) return null;
      const lower = val.toLowerCase();
      if (lower.includes('redacted') || lower.includes('not available') || lower === '') return null;
      return val;
    };

    // Detect privacy protection from registrant org/name patterns
    const orgLower = (registrant.company_name || '').toLowerCase();
    const nameLower = (registrant.full_name || '').toLowerCase();
    const privacyKeywords = ['privacy', 'proxy', 'whoisguard', 'domains by proxy', 'withheld', 'private', 'redacted', 'data protected'];
    const privacyProtected = privacyKeywords.some(kw => orgLower.includes(kw) || nameLower.includes(kw))
      || data.domain_registered === 'no';

    return {
      registrantName: clean(registrant.full_name),
      registrantOrg: clean(registrant.company_name),
      registrantStreet: clean(registrant.mailing_address),
      registrantCity: clean(registrant.city_name),
      registrantState: clean(registrant.state_name),
      registrantPostalCode: clean(registrant.zip_code),
      registrantCountry: registrant.country_name || registrant.country_code || null,
      registrantEmail: clean(registrant.email_address),
      registrantTelephone: clean(registrant.phone_number),
      registrarName: registrar.registrar_name || null,
      whoisCreatedDate: data.create_date || null,
      privacyProtected,
    };
  } catch {
    return null;
  }
}

// ============================================
// GEO-MISMATCH DETECTION
// ============================================
function detectGeoMismatch(
  serverCountry: string | null,
  registrantCountry: string | null,
  registrantEmail: string | null,
  analyzedDomain: string,
  privacyProtected: boolean,
  domainAge: string | null,
): GeoMismatch {
  const details: string[] = [];
  let severity: GeoMismatch['severity'] = 'none';

  // Compare registrant country vs server country
  if (registrantCountry && serverCountry) {
    const regNorm = registrantCountry.toLowerCase().trim();
    const srvNorm = serverCountry.toLowerCase().trim();
    if (regNorm !== srvNorm && regNorm.length > 0 && srvNorm.length > 0) {
      details.push(`Registrant in ${registrantCountry}, but server hosted in ${serverCountry}`);
      severity = 'medium';
    }
  }

  // Check if registrant email domain differs from the analyzed domain
  if (registrantEmail && !registrantEmail.includes('@')) {
    // invalid email, skip
  } else if (registrantEmail) {
    const emailDomain = registrantEmail.split('@')[1]?.toLowerCase();
    if (emailDomain && !analyzedDomain.toLowerCase().includes(emailDomain) && !emailDomain.includes(analyzedDomain.toLowerCase())) {
      // Filter out common privacy/proxy email services
      const privacyDomains = ['whoisguard', 'privacyguard', 'contactprivacy', 'whoisprivacy', 'domainsByProxy', 'withheldforprivacy'];
      const isPrivacyEmail = privacyDomains.some(pd => emailDomain.toLowerCase().includes(pd.toLowerCase()));
      if (!isPrivacyEmail) {
        details.push(`Registrant email domain (${emailDomain}) differs from site domain (${analyzedDomain})`);
        if (severity === 'none') severity = 'low';
      }
    }
  }

  // Privacy-protected + very new domain = suspicious
  if (privacyProtected && domainAge) {
    const isNew = domainAge.includes('hour') || domainAge.includes('day') || domainAge.includes('week');
    if (isNew) {
      details.push(`WHOIS privacy-protected on a very new domain (${domainAge} old)`);
      severity = severity === 'medium' ? 'high' : 'medium';
    }
  }

  // Elevate to high if multiple signals
  if (details.length >= 2 && severity === 'medium') {
    severity = 'high';
  }

  return {
    detected: details.length > 0,
    severity,
    details,
  };
}

// ============================================
// MAIN: Run All Checks
// ============================================
export async function runLinkIntelligence(url: string): Promise<RealLinkIntelligence> {
  const checksCompleted: string[] = [];
  const checksFailed: string[] = [];

  let hostname: string;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    hostname = parsed.hostname;
  } catch {
    return {
      resolvedIp: null,
      serverCountry: null,
      serverCity: null,
      isp: null,
      domainAge: null,
      registrationDate: null,
      registrar: null,
      registrantName: null,
      registrantOrg: null,
      registrantStreet: null,
      registrantCity: null,
      registrantState: null,
      registrantPostalCode: null,
      registrantCountry: null,
      registrantEmail: null,
      registrantTelephone: null,
      privacyProtected: false,
      geoMismatch: { detected: false, severity: 'none', details: [] },
      homographAttack: false,
      hasPunycode: false,
      finalUrl: null,
      redirectCount: 0,
      safeBrowsingThreats: [],
      checksCompleted: [],
      checksFailed: ['url_parse'],
    };
  }

  const whoisApiKey = (typeof process !== 'undefined' && process.env?.WHOIS_API_KEY) || '';

  // Run checks in parallel for speed
  const [dnsResult, rdapResult, homographResult, redirectResult, safeBrowsingResult, whoisResult] =
    await Promise.allSettled([
      resolveDNS(hostname),
      rdapLookup(hostname),
      Promise.resolve(checkHomograph(hostname)),
      followRedirects(url.startsWith('http') ? url : `https://${url}`),
      checkSafeBrowsing(url, (typeof process !== 'undefined' && process.env?.API_KEY) || ''),
      whoisLookup(hostname, whoisApiKey),
    ]);

  // Process DNS + GeoIP
  let resolvedIp: string | null = null;
  let geoData: GeoIPResult | null = null;

  if (dnsResult.status === 'fulfilled' && dnsResult.value) {
    resolvedIp = dnsResult.value;
    checksCompleted.push('dns');
    // GeoIP depends on DNS, so run it after
    geoData = await lookupGeoIP(resolvedIp);
    if (geoData) {
      checksCompleted.push('geoip');
    } else {
      checksFailed.push('geoip');
    }
  } else {
    checksFailed.push('dns');
  }

  // Process RDAP
  let domainAge: string | null = null;
  let registrationDate: string | null = null;
  let registrar: string | null = null;

  if (rdapResult.status === 'fulfilled' && rdapResult.value) {
    registrationDate = rdapResult.value.registrationDate;
    registrar = rdapResult.value.registrar;
    if (registrationDate) {
      domainAge = formatDomainAge(registrationDate);
    }
    checksCompleted.push('rdap');
  } else {
    checksFailed.push('rdap');
  }

  // Process Homograph
  const homograph = homographResult.status === 'fulfilled' ? homographResult.value : null;
  if (homograph) {
    checksCompleted.push('homograph');
  }

  // Process Redirects
  let finalUrl: string | null = null;
  let redirectCount = 0;
  if (redirectResult.status === 'fulfilled') {
    finalUrl = redirectResult.value.finalUrl;
    redirectCount = redirectResult.value.count;
    checksCompleted.push('redirect');
  } else {
    checksFailed.push('redirect');
  }

  // Process Safe Browsing
  let safeBrowsingThreats: string[] = [];
  if (safeBrowsingResult.status === 'fulfilled') {
    safeBrowsingThreats = safeBrowsingResult.value;
    checksCompleted.push('safe_browsing');
  } else {
    checksFailed.push('safe_browsing');
  }

  // Process Registrant: RDAP (primary) → Whoxy (fallback)
  let registrantName: string | null = null;
  let registrantOrg: string | null = null;
  let registrantStreet: string | null = null;
  let registrantCity: string | null = null;
  let registrantState: string | null = null;
  let registrantPostalCode: string | null = null;
  let registrantCountry: string | null = null;
  let registrantEmail: string | null = null;
  let registrantTelephone: string | null = null;
  let privacyProtected = false;

  // Try RDAP registrant data first (from registrar referral)
  const rdap = rdapResult.status === 'fulfilled' ? rdapResult.value : null;
  if (rdap && (rdap.registrantOrg || rdap.registrantName)) {
    registrantName = rdap.registrantName;
    registrantOrg = rdap.registrantOrg;
    registrantStreet = rdap.registrantStreet;
    registrantCity = rdap.registrantCity;
    registrantState = rdap.registrantState;
    registrantPostalCode = rdap.registrantPostalCode;
    registrantCountry = rdap.registrantCountry;
    registrantEmail = rdap.registrantEmail;
    registrantTelephone = rdap.registrantTelephone;
    privacyProtected = rdap.privacyProtected;
    checksCompleted.push('whois'); // Mark as completed since we have registrant data
  }

  // Whoxy fallback: use if RDAP didn't return registrant data
  if (whoisResult.status === 'fulfilled' && whoisResult.value) {
    const whois = whoisResult.value;
    if (!registrantOrg && !registrantName) {
      // RDAP had no registrant data, use Whoxy
      registrantName = whois.registrantName;
      registrantOrg = whois.registrantOrg;
      registrantStreet = whois.registrantStreet;
      registrantCity = whois.registrantCity;
      registrantState = whois.registrantState;
      registrantPostalCode = whois.registrantPostalCode;
      registrantCountry = whois.registrantCountry;
      registrantEmail = whois.registrantEmail;
      registrantTelephone = whois.registrantTelephone;
      privacyProtected = whois.privacyProtected;
      if (!checksCompleted.includes('whois')) checksCompleted.push('whois');
    }
    // Use Whoxy registrar as fallback if RDAP didn't get it
    if (!registrar && whois.registrarName) {
      registrar = whois.registrarName;
    }
    // Use Whoxy created date as fallback if RDAP didn't get it
    if (!registrationDate && whois.whoisCreatedDate) {
      registrationDate = whois.whoisCreatedDate;
      domainAge = formatDomainAge(whois.whoisCreatedDate);
    }
  } else if (!checksCompleted.includes('whois')) {
    checksFailed.push('whois');
  }

  // Detect geo-mismatch
  const serverCountry = geoData?.country || null;
  const geoMismatch = detectGeoMismatch(
    serverCountry,
    registrantCountry,
    registrantEmail,
    hostname,
    privacyProtected,
    domainAge,
  );

  return {
    resolvedIp,
    serverCountry,
    serverCity: geoData?.city || null,
    isp: geoData?.isp || null,
    domainAge,
    registrationDate,
    registrar,
    registrantName,
    registrantOrg,
    registrantStreet,
    registrantCity,
    registrantState,
    registrantPostalCode,
    registrantCountry,
    registrantEmail,
    registrantTelephone,
    privacyProtected,
    geoMismatch,
    homographAttack: homograph?.isHomograph || false,
    hasPunycode: homograph?.hasPunycode || false,
    finalUrl,
    redirectCount,
    safeBrowsingThreats,
    checksCompleted,
    checksFailed,
  };
}
