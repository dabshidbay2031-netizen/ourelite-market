// @vitest-environment node
/**
 * Staff (cashier) token auth + privilege enforcement.
 *
 * Cashiers have no Supabase JWT — they authenticate with a signed X-Cashier-Token.
 * The token only IDENTIFIES the cashier row; authority is re-read live from the
 * DB every request, so deactivation / privilege changes take effect at once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.CASHIER_TOKEN_SECRET = 'test-secret-for-cashier-tokens';

let cashierRow: Record<string, unknown> | null = null;
let supplierRow: Record<string, unknown> | null = null;

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  for (const m of ['select', 'eq', 'order', 'limit'] as const) b[m] = () => b;
  b.maybeSingle = () => {
    if (table === 'cashiers')  return Promise.resolve({ data: cashierRow, error: null });
    if (table === 'suppliers') return Promise.resolve({ data: supplierRow, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  return b;
}
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: (t: string) => builder(t) }),
}));

import { signCashierToken, verifyCashierToken, getCashierActor, cashierHas } from '@/lib/cashierAuth';

const reqWith = (token?: string) =>
  new Request('http://t/api/x', token ? { headers: { 'X-Cashier-Token': token } } : {});

beforeEach(() => {
  cashierRow  = { id: 'cash-1', business_id: 'owner-uid', name: 'Amina', privileges: ['pos', 'orders'], is_active: true };
  supplierRow = { id: 42 };
});

describe('token signing / verifying', () => {
  it('round-trips a valid token to its cashier id', () => {
    const t = signCashierToken('cash-1');
    expect(verifyCashierToken(t)).toBe('cash-1');
  });
  it('rejects a tampered token', () => {
    const t = signCashierToken('cash-1');
    expect(verifyCashierToken(t.slice(0, -3) + 'zzz')).toBeNull();
  });
  it('rejects junk / empty', () => {
    expect(verifyCashierToken('')).toBeNull();
    expect(verifyCashierToken('not.a.token')).toBeNull();
    expect(verifyCashierToken(null)).toBeNull();
  });
  it('a token signed with a different secret does not verify', () => {
    const t = signCashierToken('cash-1');
    process.env.CASHIER_TOKEN_SECRET = 'a-different-secret';
    expect(verifyCashierToken(t)).toBeNull();
    process.env.CASHIER_TOKEN_SECRET = 'test-secret-for-cashier-tokens';
  });
});

describe('getCashierActor — live DB re-check', () => {
  it('resolves an active cashier to its store + privileges', async () => {
    const actor = await getCashierActor(reqWith(signCashierToken('cash-1')));
    expect(actor).not.toBeNull();
    expect(actor!.supplierId).toBe(42);
    expect(actor!.ownerUserId).toBe('owner-uid');
    expect(cashierHas(actor, 'orders')).toBe(true);
    expect(cashierHas(actor, 'settings')).toBe(false);
  });

  it('returns null for a DEACTIVATED cashier even with a valid token', async () => {
    cashierRow = { ...cashierRow!, is_active: false };
    expect(await getCashierActor(reqWith(signCashierToken('cash-1')))).toBeNull();
  });

  it('returns null when there is no token', async () => {
    expect(await getCashierActor(reqWith())).toBeNull();
  });

  it('reflects LIVE privilege revocation (token unchanged)', async () => {
    const token = signCashierToken('cash-1');
    expect(cashierHas(await getCashierActor(reqWith(token)), 'orders')).toBe(true);
    // Owner removes the 'orders' grant — same token, new authority.
    cashierRow = { ...cashierRow!, privileges: ['pos'] };
    expect(cashierHas(await getCashierActor(reqWith(token)), 'orders')).toBe(false);
  });

  it('supplierId is null when the owner has no store row', async () => {
    supplierRow = null;
    const actor = await getCashierActor(reqWith(signCashierToken('cash-1')));
    expect(actor!.supplierId).toBeNull();
  });
});
