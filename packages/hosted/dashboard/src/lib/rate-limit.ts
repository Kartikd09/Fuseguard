// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Lightweight per-key fixed-window rate limiter for API routes.
//
// MVP: in-memory map (per server instance). Good enough for abuse protection at launch
// scale. Post-launch / multi-instance: swap the Map for Upstash Redis or a Supabase
// counter — only this file changes.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

// Periodically evict expired buckets so the map doesn't grow unbounded.
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, w] of buckets) {
    if (w.resetAt < now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window rate limit. Returns allowed=false once `limit` requests are seen
 * within `windowMs` for the given `key` (e.g. user id or IP).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}
