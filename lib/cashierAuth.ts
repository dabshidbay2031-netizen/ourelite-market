import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Staff (cashier) authentication — server side.
 *
 * Cashiers are NOT Supabase auth users: the owner creates them with a phone +
 * password, so they have no JWT. Without a credential every guarded /api call
 * 401s, which is why staff saw "Sign in to view orders / chat".
 *
 * A cashier login now gets an HMAC-signed token. It is:
 *   • stateless to verify (no session table), and
 *   • re-checked against the LIVE cashiers row on every request, so
 *     deactivating a cashier or changing their privileges takes effect at once
 *     (the token itself carries no authority beyond identifying the row).
 *
 * The token is sent in the `X-Cashier-Token` header (see lib/clientAuth).
 */

const HEADER = 'x-cashier-token';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Signing secret — server-only. Falls back to the service-role key so this
 *  works with no extra configuration; set CASHIER_TOKEN_SECRET to rotate. */
function secret(): string {
  return process.env.CASHIER_TOKEN_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || '';
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Issue a token for a freshly authenticated cashier. */
export function signCashierToken(cashierId: string): string {
  // `nonce` keeps two tokens for the same cashier distinct.
  const body = b64url(JSON.stringify({
    cid: cashierId,
    exp: Date.now() + TTL_MS,
    n:   randomBytes(6).toString('base64url'),
  }));
  return `${body}.${sign(body)}`;
}

/** Verify signature + expiry. Returns the cashier id, or null. */
export function verifyCashierToken(token: string | null | undefined): string | null {
  if (!token || !secret()) return null;
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  try {
    const expected = Buffer.from(sign(body));
    const given    = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { cid?: string; exp?: number };
    if (!payload.cid || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload.cid;
  } catch {
    return null;
  }
}

export interface CashierActor {
  cashierId:   string;
  /** cashiers.business_id — the OWNER'S auth user id (not the supplier id). */
  ownerUserId: string;
  /** The store this cashier operates (suppliers.id), or null if unresolved. */
  supplierId:  number | null;
  privileges:  string[];
  name:        string;
}

/**
 * Resolve the cashier behind a request, re-reading the live row so a
 * deactivated cashier (or revoked privilege) is rejected immediately.
 * Returns null when there's no valid cashier token.
 */
export async function getCashierActor(req: Request): Promise<CashierActor | null> {
  const cashierId = verifyCashierToken(req.headers.get(HEADER));
  if (!cashierId) return null;

  const sb = getSupabaseAdmin();
  const { data: row } = await sb
    .from('cashiers')
    .select('id, business_id, name, privileges, is_active')
    .eq('id', cashierId)
    .maybeSingle();
  if (!row || row.is_active === false) return null;

  // cashiers.business_id is the owner's auth user id → find their store.
  const ownerUserId = String(row.business_id);
  const { data: sup } = await sb
    .from('suppliers').select('id').eq('auth_user_id', ownerUserId).maybeSingle();

  return {
    cashierId:   String(row.id),
    ownerUserId,
    supplierId:  (sup?.id as number | undefined) ?? null,
    privileges:  Array.isArray(row.privileges) ? (row.privileges as string[]) : [],
    name:        String(row.name ?? 'Staff'),
  };
}

/** True when this cashier holds the given privilege. */
export function cashierHas(actor: CashierActor | null, privilege: string): boolean {
  return !!actor && actor.privileges.includes(privilege);
}
