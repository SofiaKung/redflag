const buckets = new Map();

function nowMs() {
  return Date.now();
}

function getLimit(envName, fallbackValue) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

export function getRouteRateLimit(routeKey) {
  switch (routeKey) {
    case 'gemini':
      return getLimit('RATE_LIMIT_GEMINI_PER_MIN', 10);
    case 'link_intel':
      return getLimit('RATE_LIMIT_LINK_INTEL_PER_MIN', 30);
    case 'screenshot':
      return getLimit('RATE_LIMIT_SCREENSHOT_PER_MIN', 20);
    default:
      return getLimit('RATE_LIMIT_DEFAULT_PER_MIN', 20);
  }
}

export function applyRateLimit({ routeKey, clientKey, windowMs = 60_000 }) {
  const limit = getRouteRateLimit(routeKey);
  const key = `${routeKey}:${clientKey}`;
  const currentTime = nowMs();

  let bucket = buckets.get(key);
  if (!bucket || currentTime >= bucket.resetAt) {
    bucket = { count: 0, resetAt: currentTime + windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
    };
  }

  bucket.count += 1;

  // Lightweight cleanup to avoid unbounded memory in long-lived instances.
  if (buckets.size > 5000) {
    for (const [storedKey, storedBucket] of buckets.entries()) {
      if (currentTime >= storedBucket.resetAt) buckets.delete(storedKey);
    }
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: 0,
  };
}

export function attachRateLimitHeaders(res, info) {
  res.setHeader('X-RateLimit-Limit', String(info.limit));
  res.setHeader('X-RateLimit-Remaining', String(info.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(info.resetAt / 1000)));
  if (!info.allowed) {
    res.setHeader('Retry-After', String(info.retryAfterSec));
  }
}
