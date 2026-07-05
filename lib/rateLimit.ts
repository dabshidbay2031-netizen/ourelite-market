/**
 * Lightweight in-memory fixed-window rate limiter.
 *
 * NOTE: state lives in the process, so on serverless (Vercel) it's per-instance
 * and resets on cold start — it blunts simple bursts/brute-force but is not a
 * global limiter. For hard guarantees across instances, back this with Upstash
 * Redis (`@upstash/ratelimit`) and keep this signature.
 */
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  // opportunistic cleanup so the map can't grow unbounded
  if (store.size > 5000) {
    store.forEach((b, k) => { if (now > b.resetAt) store.delete(k); });
  }
  const b = store.get(key);
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get('x-forwarded-for')?.split(',')[0].trim()
    || h.get('x-real-ip')
    || 'unknown';
}
