/**
 * Server → browser realtime pings via Supabase Realtime's HTTP broadcast API.
 *
 * API routes call `pingRealtime(...)` after a successful mutation. Subscribed
 * browsers (see lib/useRealtimePing.ts) receive the ping instantly and re-run
 * their own scoped, authenticated API fetch. The ping itself carries NO row
 * data — this keeps the existing security posture (the anon key must never
 * see a firehose of other tenants' rows; see the note in useLiveRefresh).
 *
 * Topics in use:
 *   catalog            products / stock / claims changed → reload catalog
 *   notifications      notifications table changed
 *   orders             any order created/updated (admin dashboard)
 *   store:{supplierId} something for this store (new order, status change)
 *   user:{userId}      something for this user (their order, chat message)
 *
 * Fire-and-forget: a realtime outage must never fail or slow the mutation.
 */

import { after } from 'next/server';

const PING_TIMEOUT_MS = 3000;

/**
 * Run `fn` after the response is sent (zero added latency) via next/server's
 * after(). Outside a request scope — unit tests calling handlers directly —
 * after() throws, so fall back to firing immediately, and never let a
 * notification failure surface into the route.
 */
export function runAfterResponse(fn: () => void | Promise<void>): void {
  const safe = async () => { try { await fn(); } catch { /* best-effort */ } };
  // Pass the fn (not an invoked promise) so a throw from after() itself means
  // the work hasn't started yet and the fallback fires it exactly once.
  try { after(safe); } catch { void safe(); }
}

export function pingRealtime(topics: string | Array<string | null | undefined>, event = 'ping'): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const list = (Array.isArray(topics) ? topics : [topics])
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (!list.length) return;

  const body = JSON.stringify({
    messages: list.map(topic => ({ topic, event, payload: { at: Date.now() } })),
  });

  // Deliberately not awaited by callers — .catch swallows network errors.
  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body,
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  }).catch(() => { /* realtime is best-effort */ });
}
