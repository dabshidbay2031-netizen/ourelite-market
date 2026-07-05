/**
 * Sifalo Pay gateway provider (server-side only — never import in client code,
 * it reads secret credentials).
 *
 * Sifalo Pay (https://sifalopay.com) is a Somali payment gateway covering the
 * local mobile wallets — EVC Plus / ZAAD / SAHAL (gateway "waafi"), eDahab
 * ("edahab") and Premier Wallet ("pbwallet") — plus cards.
 *
 *   Charge:  POST {BASE}/            { account, gateway, amount, currency, order_id }
 *   Verify:  POST {BASE}/verify.php  { sid }  ->  { status, code }
 *   Auth:    Authorization: Basic <username:password>
 *   Codes:   601 success · 603 pending · 604 insufficient · 600 failed
 *
 * Until real credentials are configured (env below), this runs in MOCK mode so
 * the whole checkout works end-to-end; the moment the env vars are set it calls
 * the live API with no other code change.
 *
 *   SIFALO_API_BASE       default https://api.sifalopay.com/gateway
 *   SIFALO_API_USERNAME   \ used to build "Basic user:pass"
 *   SIFALO_API_PASSWORD   /
 *   SIFALO_AUTH           optional — full Authorization header value, overrides the two above
 *   SIFALO_CURRENCY       default USD ("USD" | "SLSH")
 */

import type { SifaloGateway } from '@/lib/types';

const BASE = (process.env.SIFALO_API_BASE || 'https://api.sifalopay.com/gateway').replace(/\/+$/, '');
const CHECKOUT_PAGE = process.env.SIFALO_CHECKOUT_URL || 'https://pay.sifalo.com/checkout/';

export type SifaloStatus = 'success' | 'pending' | 'failed';

export interface SifaloResult {
  status:  SifaloStatus;
  sid:     string | null;   // Sifalo transaction id (used to verify later)
  code:    string | null;   // raw gateway code (601/603/604/600…)
  message: string;          // human-readable message for the buyer
  mock:    boolean;         // true when no credentials were configured
}

/** Map a raw Sifalo numeric code to our normalized status. Pure + tested. */
export function mapSifaloCode(code: string | number | null | undefined): SifaloStatus {
  switch (String(code ?? '')) {
    case '601': return 'success';
    case '603': return 'pending';
    default:    return 'failed'; // 604 insufficient, 600 failed, or unknown
  }
}

/** Normalize the verify.php `status` string. */
export function mapSifaloStatus(status: string | null | undefined): SifaloStatus {
  switch (String(status ?? '').toLowerCase()) {
    case 'success': return 'success';
    case 'pending': return 'pending';
    default:        return 'failed';
  }
}

/**
 * Build a standard HTTP Basic auth header value: `Basic base64(user:pass)`.
 * (Sifalo's docs SHOW a literal `Basic username:password`, but probing the live
 * gateway confirmed it only authenticates with proper base64 encoding.)
 */
export function buildBasicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** The Authorization header value, or null when no credentials are configured. */
function authHeader(): string | null {
  if (process.env.SIFALO_AUTH) return process.env.SIFALO_AUTH;
  const u = process.env.SIFALO_API_USERNAME;
  const p = process.env.SIFALO_API_PASSWORD;
  if (u && p) return buildBasicAuth(u, p);
  return null;
}

export function isSifaloConfigured(): boolean {
  return authHeader() !== null;
}

const currency = (): string => process.env.SIFALO_CURRENCY || 'USD';

export interface InitiateInput {
  account:  string;         // customer wallet number, e.g. 2526XXXXXXXX
  gateway:  SifaloGateway;
  amount:   number;
  orderId?: string;
}

/**
 * Initiate a wallet debit. Returns a normalized result; the buyer typically
 * approves on their phone (USSD push) and we get 601 (success) or 603 (pending).
 */
export async function initiateSifaloPayment(input: InitiateInput): Promise<SifaloResult> {
  const auth = authHeader();

  // ── MOCK MODE — no credentials yet ───────────────────────────────────────
  if (!auth) {
    return {
      status: 'success',
      sid: `MOCK-${Date.now()}`,
      code: '601',
      message: 'Mock approval — Sifalo Pay credentials not configured yet.',
      mock: true,
    };
  }

  try {
    const res = await fetch(`${BASE}/`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account:  input.account,
        gateway:  input.gateway,
        amount:   String(input.amount),
        currency: currency(),
        order_id: input.orderId ?? '',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      status:  mapSifaloCode(data.code as string),
      sid:     data.sid != null ? String(data.sid) : null,
      code:    data.code != null ? String(data.code) : null,
      message: (data.response as string) || '',
      mock:    false,
    };
  } catch (e) {
    return { status: 'failed', sid: null, code: null, message: e instanceof Error ? e.message : 'Network error', mock: false };
  }
}

export interface CheckoutInput {
  amount:    number;
  returnUrl: string;  // where Sifalo sends the customer back; must carry ?order_id=<ref>
  orderId?:  string;
}
export interface CheckoutResult {
  ok:      boolean;
  url:     string | null; // hosted page to redirect the customer to
  message: string;
  mock:    boolean;
}

/**
 * Create a HOSTED CHECKOUT session (gateway "checkout"). Returns the
 * pay.sifalo.com URL to redirect the buyer to, where they pick their wallet
 * (EVC/ZAAD/SAHAL/eDahab/Premier) and pay. Sifalo then sends them back to
 * returnUrl with `&sid=…` appended, which we verify.
 *
 * This is the flow this merchant account supports — the direct wallet-debit
 * endpoint returns 600 for every request on it.
 */
export async function createSifaloCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const auth = authHeader();

  // MOCK MODE — loop straight back to the return URL with a mock sid so the
  // whole flow is testable locally without real credentials.
  if (!auth) {
    const sep = input.returnUrl.includes('?') ? '&' : '?';
    return { ok: true, url: `${input.returnUrl}${sep}sid=MOCK-${Date.now()}`, message: 'mock', mock: true };
  }

  try {
    const res = await fetch(`${BASE}/`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount:     String(input.amount),
        gateway:    'checkout',
        currency:   currency(),
        return_url: input.returnUrl,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // key/token come back already URL-encoded — append verbatim.
    if (data.key && data.token) {
      return { ok: true, url: `${CHECKOUT_PAGE}?key=${data.key}&token=${data.token}`, message: '', mock: false };
    }
    return { ok: false, url: null, message: (data.response as string) || 'Could not start Sifalo checkout.', mock: false };
  } catch (e) {
    return { ok: false, url: null, message: e instanceof Error ? e.message : 'Network error', mock: false };
  }
}

/** Verify a transaction later (for pending charges). */
export async function verifySifaloPayment(ref: { sid?: string; orderId?: string }): Promise<SifaloResult> {
  const auth = authHeader();
  if (!auth) {
    return { status: 'success', sid: ref.sid ?? null, code: '601', message: 'Mock verify — not configured.', mock: true };
  }
  try {
    const res = await fetch(`${BASE}/verify.php`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(ref.sid ? { sid: ref.sid } : { order_id: ref.orderId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      status:  data.status != null ? mapSifaloStatus(data.status as string) : mapSifaloCode(data.code as string),
      sid:     data.sid != null ? String(data.sid) : (ref.sid ?? null),
      code:    data.code != null ? String(data.code) : null,
      message: (data.response as string) || (data.status as string) || '',
      mock:    false,
    };
  } catch (e) {
    return { status: 'failed', sid: ref.sid ?? null, code: null, message: e instanceof Error ? e.message : 'Network error', mock: false };
  }
}
