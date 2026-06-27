// Best-effort in-memory sliding-window rate limiter.
//
// NOTE: this lives in the server process memory, so on a serverless/multi-
// instance deployment (e.g. Vercel) it only throttles within a single warm
// instance — it is NOT a hard, global limit. It still raises the cost of a
// brute-force burst meaningfully. For a strict global limit, back this with a
// shared store (Upstash/Redis or a Postgres counter).

type Hit = { count: number; resetAt: number };
const buckets = new Map<string, Hit>();

// Opportunistically drop expired buckets so the Map doesn't grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

/**
 * Returns { ok } — false when `key` has exceeded `limit` hits within `windowMs`.
 * `retryAfter` (seconds) is set when blocked.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const hit = buckets.get(key);
  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  hit.count += 1;
  if (hit.count > limit) {
    return { ok: false, retryAfter: Math.ceil((hit.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}
