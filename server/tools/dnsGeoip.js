/**
 * DNS Resolution (dns.google) + GeoIP Lookup (ipwho.is)
 * Combined into one tool since GeoIP depends on DNS result.
 */

async function resolveDNS(domain) {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.Answer?.[0]?.data || null;
  } catch {
    return null;
  }
}

async function lookupGeoIP(ip) {
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

export async function dnsGeoip({ domain }) {
  const ip = await resolveDNS(domain);
  if (!ip) {
    return { ip: null, country: null, city: null, isp: null, success: false };
  }

  const geo = await lookupGeoIP(ip);
  return {
    ip,
    country: geo?.country || null,
    city: geo?.city || null,
    isp: geo?.isp || null,
    success: true,
  };
}
