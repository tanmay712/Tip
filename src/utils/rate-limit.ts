import { LIMITS } from "./constants.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limits = new Map<string, RateLimitEntry>();

export function checkRateLimit(userId: string): {
  allowed: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = limits.get(userId);

  if (!entry || now >= entry.resetAt) {
    limits.set(userId, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= LIMITS.rateLimitPerMinute) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits) {
    if (now >= entry.resetAt) limits.delete(key);
  }
}, 300_000).unref();
