
/**
 * linkIntelligence.ts
 *
 * Real technical checks for URL analysis — no AI guessing.
 * Public checks run directly from browser-safe APIs.
 * Secret checks (Safe Browsing / WHOIS) are delegated to a same-origin backend route.
 *
 * Checks:
 *  1. DNS Resolution → Google DNS-over-HTTPS
 *  2. GeoIP Lookup → ipwho.is
 *  3. Homograph/Punycode Detection → Pure JS (local)
 *  4. Safe Browsing + Whoxy WHOIS → backend (/api/link-intel-secrets)
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
// CHECK 3: Domain Age (computed from Whoxy WHOIS date)
// ============================================

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

const COMMON_MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'net.uk', 'sch.uk', 'me.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp', 'ed.jp', 'lg.jp',
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg', 'per.sg',
  'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my',
  'co.id', 'ac.id', 'or.id', 'go.id',
  'co.in', 'firm.in', 'net.in', 'org.in', 'gen.in', 'ind.in',
  'com.br', 'net.br', 'org.br',
  'co.nz', 'org.nz', 'net.nz', 'govt.nz',
  'co.za', 'org.za', 'net.za',
  'com.mx', 'org.mx', 'gob.mx',
  'com.tr', 'net.tr', 'org.tr',
]);

function isIpAddress(hostname: string): boolean {
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return ipv4.test(hostname) || hostname.includes(':') && ipv6.test(hostname);
}

export function getRegistrableDomain(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || isIpAddress(normalized)) return normalized;

  const labels = normalized.split('.').filter(Boolean);
  if (labels.length <= 2) return normalized;

  const lastTwo = labels.slice(-2).join('.');
  if (COMMON_MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }

  return lastTwo;
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
  const cyrillicPattern = /[\u0400-\u04FF]/u;
  const hasCyrillic = cyrillicPattern.test(hostname);
  const zeroWidth = /\u200B|\u200C|\u200D|\uFEFF/u;
  const hasZeroWidth = zeroWidth.test(hostname);

  // Mixed script detection (Latin + non-Latin in same label)
  const latinPattern = /[a-zA-Z]/;
  const nonLatinPattern = /[^\p{ASCII}]/u;
  const hasMixedScript = latinPattern.test(hostname) && nonLatinPattern.test(hostname);

  return {
    hasPunycode,
    hasCyrillic,
    hasZeroWidth,
    hasMixedScript,
    isHomograph: hasPunycode || hasCyrillic || hasZeroWidth || hasMixedScript,
  };
}

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

interface SecretIntelResult {
  safeBrowsingThreats: string[];
  whois: WhoisResult | null;
}

async function fetchSecretIntel(url: string, domain: string): Promise<SecretIntelResult | null> {
  try {
    const response = await fetch('/api/link-intel-secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, domain }),
    });

    if (!response.ok) return null;
    const data = await response.json();

    return {
      safeBrowsingThreats: Array.isArray(data?.safeBrowsingThreats)
        ? data.safeBrowsingThreats.filter((threat: unknown) => typeof threat === 'string')
        : [],
      whois: data?.whois || null,
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

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
  let hostname: string;
  let registrableDomain: string;
  try {
    const parsed = new URL(normalizedUrl);
    hostname = parsed.hostname;
    registrableDomain = getRegistrableDomain(hostname);
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
      safeBrowsingThreats: [],
      checksCompleted: [],
      checksFailed: ['url_parse'],
    };
  }

  // Run checks in parallel for speed
  const [dnsResult, homographResult, secretIntelResult] =
    await Promise.allSettled([
      resolveDNS(hostname),
      Promise.resolve(checkHomograph(hostname)),
      fetchSecretIntel(normalizedUrl, registrableDomain),
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

  // Process Homograph
  const homograph = homographResult.status === 'fulfilled' ? homographResult.value : null;
  if (homograph) {
    checksCompleted.push('homograph');
  }

  // Process Secret Intel (Safe Browsing + Whoxy WHOIS)
  let safeBrowsingThreats: string[] = [];
  let whois: WhoisResult | null = null;
  if (secretIntelResult.status === 'fulfilled' && secretIntelResult.value) {
    safeBrowsingThreats = secretIntelResult.value.safeBrowsingThreats;
    whois = secretIntelResult.value.whois;
    checksCompleted.push('safe_browsing');
  } else {
    checksFailed.push('safe_browsing');
  }

  // Process Registrant from Whoxy WHOIS
  let domainAge: string | null = null;
  let registrationDate: string | null = null;
  let registrar: string | null = null;
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

  if (whois) {
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
    if (whois.registrarName) registrar = whois.registrarName;
    if (whois.whoisCreatedDate) {
      registrationDate = whois.whoisCreatedDate;
      domainAge = formatDomainAge(whois.whoisCreatedDate);
    }
    checksCompleted.push('whois');
  } else {
    checksFailed.push('whois');
  }

  // Detect geo-mismatch
  const serverCountry = geoData?.country || null;
  const geoMismatch = detectGeoMismatch(
    serverCountry,
    registrantCountry,
    registrantEmail,
    registrableDomain,
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
    safeBrowsingThreats,
    checksCompleted,
    checksFailed,
  };
}
