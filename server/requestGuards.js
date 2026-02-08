import net from 'node:net';
import dns from 'node:dns/promises';

function readHeader(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getDerivedOrigin(req) {
  const host = readHeader(req, 'x-forwarded-host') || readHeader(req, 'host');
  if (!host) return null;
  const forwardedProto = readHeader(req, 'x-forwarded-proto');
  const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function getAllowedOrigins(req) {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((entry) => normalizeOrigin(entry.trim()))
      .filter((entry) => !!entry);
  }

  if (process.env.NODE_ENV === 'production') {
    // Fail closed in production unless ALLOWED_ORIGINS is explicitly configured.
    return [];
  }

  const derived = getDerivedOrigin(req);
  return derived ? [derived] : [];
}

export function isRequestOriginAllowed(req) {
  const allowedOrigins = getAllowedOrigins(req);
  if (allowedOrigins.length === 0) return false;

  const originHeader = normalizeOrigin(readHeader(req, 'origin'));
  const refererHeaderRaw = readHeader(req, 'referer');
  const refererOrigin = refererHeaderRaw ? normalizeOrigin(refererHeaderRaw) : null;

  if (!originHeader && !refererOrigin) return false;

  return [originHeader, refererOrigin]
    .filter((value) => !!value)
    .some((candidate) => allowedOrigins.includes(candidate));
}

export function getClientIp(req) {
  const forwardedFor = readHeader(req, 'x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = readHeader(req, 'x-real-ip');
  if (realIp) return realIp;

  return req.socket?.remoteAddress || 'unknown';
}

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return true;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true; // fe80::/10
  }
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.replace('::ffff:', '');
    return isPrivateIpv4(mapped);
  }
  return false;
}

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) return isPrivateIpv4(ip);
  if (net.isIP(ip) === 6) return isPrivateIpv6(ip);
  return true;
}

async function resolvesToPrivateAddress(hostname) {
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!Array.isArray(addresses) || addresses.length === 0) return false;
    return addresses.some((record) => isPrivateIp(record.address));
  } catch {
    // If DNS resolution fails, do not block solely on that reason.
    return false;
  }
}

export async function validatePublicHttpUrl(rawValue) {
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    return { ok: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTP/HTTPS URLs are allowed' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Credentialed URLs are not allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { ok: false, reason: 'Local/internal hostnames are blocked' };
  }

  if (net.isIP(hostname) !== 0 && isPrivateIp(hostname)) {
    return { ok: false, reason: 'Private or loopback IP ranges are blocked' };
  }

  if (await resolvesToPrivateAddress(hostname)) {
    return { ok: false, reason: 'Host resolves to a private/internal address' };
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    hostname: parsed.hostname,
  };
}
