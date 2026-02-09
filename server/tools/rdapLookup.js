/**
 * RDAP domain lookup (IANA standard) with Whoxy WHOIS fallback.
 * Returns: registration date, registrar, registrant data, privacy detection.
 *
 * Pipeline: IANA bootstrap → registry RDAP → registrar referral → vCard parsing
 * Fallback: If RDAP returns no registrant → try Whoxy WHOIS API
 */

// ---- Domain utilities ----

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

function isIpAddress(hostname) {
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return ipv4.test(hostname) || (hostname.includes(':') && ipv6.test(hostname));
}

export function getRegistrableDomain(hostname) {
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

export function formatDomainAge(registrationDate) {
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

// ---- RDAP bootstrap ----

let rdapBootstrapCache = null;

async function getRdapServer(tld) {
  try {
    if (!rdapBootstrapCache) {
      const res = await fetch('https://data.iana.org/rdap/dns.json');
      if (!res.ok) return null;
      rdapBootstrapCache = await res.json();
    }

    for (const entry of rdapBootstrapCache.services) {
      if (entry[0].includes(tld)) {
        return entry[1][0];
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---- vCard parsing ----

const PRIVACY_KEYWORDS = [
  'privacy', 'proxy', 'whoisguard', 'domains by proxy',
  'withheld', 'private', 'data protected',
];

function cleanValue(val) {
  if (!val || val.trim() === '') return null;
  const lower = val.toLowerCase();
  if (lower.includes('redacted for privacy') && lower.length < 30) return null;
  return val;
}

function parseRegistrantFromEntities(entities) {
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

    let name = null, org = null, street = null, city = null;
    let state = null, postalCode = null, country = null;
    let email = null, tel = null;

    for (const field of vcard) {
      const [type, , , value] = field;
      if (type === 'fn' && value) name = value;
      if (type === 'org' && value) org = value;
      if (type === 'email' && value) email = value;
      if (type === 'tel') {
        tel = (typeof value === 'string' ? value : null)?.replace(/^tel:/, '') || null;
      }
      if (type === 'adr' && Array.isArray(value)) {
        street = value[2] || null;
        city = value[3] || null;
        state = value[4] || null;
        postalCode = value[5] || null;
        country = value[6] || null;
      }
    }

    const orgLower = (org || '').toLowerCase();
    const nameLower = (name || '').toLowerCase();
    const privacyProtected = PRIVACY_KEYWORDS.some(
      (kw) => orgLower.includes(kw) || nameLower.includes(kw)
    );

    return {
      registrantName: cleanValue(name),
      registrantOrg: org || null,
      registrantStreet: cleanValue(street),
      registrantCity: cleanValue(city),
      registrantState: cleanValue(state),
      registrantPostalCode: cleanValue(postalCode),
      registrantCountry: cleanValue(country),
      registrantEmail: email || null,
      registrantTelephone: tel || null,
      privacyProtected,
    };
  }

  return empty;
}

// ---- RDAP core ----

async function rdapQuery(domain) {
  try {
    const tld = domain.split('.').pop();
    if (!tld) return null;

    const server = await getRdapServer(tld);
    if (!server) return null;

    const res = await fetch(`${server}domain/${domain}`, {
      headers: { Accept: 'application/rdap+json' },
    });
    if (!res.ok) return null;

    const data = await res.json();

    const events = data.events || [];
    const registration = events.find((e) => e.eventAction === 'registration');

    let registrar = null;
    const entities = data.entities || [];
    for (const entity of entities) {
      if (entity.roles?.includes('registrar')) {
        registrar =
          entity.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] ||
          entity.handle ||
          null;
        break;
      }
    }

    let registrant = parseRegistrantFromEntities(entities);

    // Follow registrar referral if no registrant data from registry
    if (!registrant.registrantOrg && !registrant.registrantName) {
      const relatedLink = (data.links || []).find(
        (l) => l.rel === 'related' && l.href?.includes('/domain/')
      );
      if (relatedLink?.href) {
        try {
          const registrarRes = await fetch(relatedLink.href, {
            headers: { Accept: 'application/rdap+json' },
          });
          if (registrarRes.ok) {
            const registrarData = await registrarRes.json();
            registrant = parseRegistrantFromEntities(registrarData.entities || []);
            if (!registration) {
              const regEvents = registrarData.events || [];
              const regEvt = regEvents.find((e) => e.eventAction === 'registration');
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

// ---- Whoxy fallback ----

function cleanWhoisValue(value) {
  if (!value || typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  if (lower.includes('redacted') || lower.includes('not available') || lower.trim() === '') return null;
  return value;
}

async function whoxyFallback(domain, apiKey) {
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
    const privacyProtected =
      PRIVACY_KEYWORDS.some((kw) => orgLower.includes(kw) || nameLower.includes(kw)) ||
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

// ---- Main tool function ----

export async function rdapLookup({ domain }, env) {
  const rdap = await rdapQuery(domain);

  let registrationDate = rdap?.registrationDate || null;
  let registrar = rdap?.registrar || null;
  let registrantName = rdap?.registrantName || null;
  let registrantOrg = rdap?.registrantOrg || null;
  let registrantStreet = rdap?.registrantStreet || null;
  let registrantCity = rdap?.registrantCity || null;
  let registrantState = rdap?.registrantState || null;
  let registrantPostalCode = rdap?.registrantPostalCode || null;
  let registrantCountry = rdap?.registrantCountry || null;
  let registrantEmail = rdap?.registrantEmail || null;
  let registrantTelephone = rdap?.registrantTelephone || null;
  let privacyProtected = rdap?.privacyProtected || false;
  let source = rdap ? 'rdap' : null;

  // Whoxy fallback if RDAP returned no registrant data
  if (!registrantOrg && !registrantName) {
    const whoisApiKey = (env?.WHOIS_API_KEY || '').trim();
    const whois = await whoxyFallback(domain, whoisApiKey);
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
      if (!registrar && whois.registrarName) registrar = whois.registrarName;
      if (!registrationDate && whois.whoisCreatedDate) registrationDate = whois.whoisCreatedDate;
      source = source ? 'rdap+whoxy' : 'whoxy';
    }
  }

  const domainAge = registrationDate ? formatDomainAge(registrationDate) : null;

  return {
    registrationDate,
    domainAge,
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
    source,
  };
}
