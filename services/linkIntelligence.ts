
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
// CHECK 2: GeoIP via ip-api.com (free, CORS-friendly)
// ============================================
interface GeoIPResult {
  country: string;
  city: string;
  isp: string;
  org: string;
}

async function lookupGeoIP(ip: string): Promise<GeoIPResult | null> {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,org`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'success') return null;
    return data as GeoIPResult;
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

    return {
      registrationDate: registration?.eventDate || null,
      registrar,
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
      homographAttack: false,
      hasPunycode: false,
      finalUrl: null,
      redirectCount: 0,
      safeBrowsingThreats: [],
      checksCompleted: [],
      checksFailed: ['url_parse'],
    };
  }

  // Run checks in parallel for speed
  const [dnsResult, rdapResult, homographResult, redirectResult, safeBrowsingResult] =
    await Promise.allSettled([
      resolveDNS(hostname),
      rdapLookup(hostname),
      Promise.resolve(checkHomograph(hostname)),
      followRedirects(url.startsWith('http') ? url : `https://${url}`),
      checkSafeBrowsing(url, (typeof process !== 'undefined' && process.env?.API_KEY) || ''),
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

  return {
    resolvedIp,
    serverCountry: geoData?.country || null,
    serverCity: geoData?.city || null,
    isp: geoData?.isp || null,
    domainAge,
    registrationDate,
    registrar,
    homographAttack: homograph?.isHomograph || false,
    hasPunycode: homograph?.hasPunycode || false,
    finalUrl,
    redirectCount,
    safeBrowsingThreats,
    checksCompleted,
    checksFailed,
  };
}
