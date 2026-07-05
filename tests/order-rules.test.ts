// @vitest-environment node
/**
 * Order rules:
 *  1. Orders are NEVER hard-deleted — DELETE soft-labels them 'deleted'.
 *  2. Deleted/cancelled/refunded money never counts as revenue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRevenueOrder, sumRevenue } from '@/lib/revenue';

/* ── Supabase mock that RECORDS which methods are called ────── */

let sbCalls: string[] = [];
let updateResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    // Staff guard: the DELETE/PATCH order routes require an authenticated
    // admin/business caller. Resolve a staff user and an admins-table row.
    auth: { getUser: async () => ({ data: { user: { id: 'staff-uid' } }, error: null }) },
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'in', 'limit', 'update', 'insert', 'delete']) {
        b[m] = (...args: unknown[]) => {
          sbCalls.push(`${table}.${m}${m === 'update' ? `:${JSON.stringify(args[0])}` : ''}`);
          return b;
        };
      }
      // admins lookup → caller is an admin (authorizes requireStaff);
      // every other table resolves the test-controlled result.
      b.maybeSingle = () => Promise.resolve(
        table === 'admins' ? { data: { user_id: 'staff-uid' }, error: null } : updateResult);
      b.single      = () => Promise.resolve(updateResult);
      (b as { then?: unknown }).then =
        (res: (v: unknown) => void) => Promise.resolve(updateResult).then(res);
      return b;
    },
    rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202' } }),
  }),
}));

/** Staff-authenticated DELETE request (the route now requires it). */
const staffReq = (id: string) =>
  new Request(`http://t/api/orders/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer staff' } });

import { DELETE as orderDelete } from '@/app/api/orders/[id]/route';

beforeEach(() => {
  sbCalls = [];
  updateResult = { data: null, error: null };
});

/* ── Revenue rules ───────────────────────────────────────────── */

describe('revenue rules', () => {
  it('normal statuses count as revenue', () => {
    for (const status of ['pending', 'processing', 'shipped', 'completed', 'bulk_pending']) {
      expect(isRevenueOrder({ status })).toBe(true);
    }
  });

  it('deleted, cancelled, refunded never count', () => {
    for (const status of ['deleted', 'cancelled', 'refunded']) {
      expect(isRevenueOrder({ status })).toBe(false);
    }
  });

  it('sumRevenue skips non-revenue money', () => {
    const orders = [
      { status: 'completed', total: 100 },
      { status: 'deleted',   total: 999 },   // must NOT count
      { status: 'pending',   total: 50 },
      { status: 'cancelled', total: 500 },   // must NOT count
      { status: 'refunded',  total: 300 },   // must NOT count
    ];
    expect(sumRevenue(orders)).toBe(150);
  });

  it('tolerates string totals and missing fields', () => {
    expect(sumRevenue([{ status: 'completed', total: '12.50' }, { status: 'completed' }])).toBe(12.5);
  });
});

/* ── Soft delete ─────────────────────────────────────────────── */

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('DELETE /api/orders/[id] is a SOFT delete', () => {
  it('marks the order deleted instead of removing the row', async () => {
    updateResult = {
      data: {
        id: 'ORD-1', customer_name: 'A', customer_phone: '1', items: [],
        subtotal: 10, discount: 0, total: 10, payment_method: 'cash',
        status: 'deleted', created_at: '2026-06-13',
      },
      error: null,
    };

    const res  = await orderDelete(staffReq('ORD-1'), params('ORD-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.softDeleted).toBe(true);
    expect(body.order.status).toBe('deleted');

    // The hard rule: status update happened, row deletion NEVER did
    expect(sbCalls.some(c => c.startsWith('orders.update') && c.includes('"status":"deleted"'))).toBe(true);
    expect(sbCalls.some(c => c === 'orders.delete')).toBe(false);
  });

  it('unknown order → 404, still no hard delete', async () => {
    updateResult = { data: null, error: null };
    const res = await orderDelete(staffReq('NOPE'), params('NOPE'));
    expect(res.status).toBe(404);
    expect(sbCalls.some(c => c === 'orders.delete')).toBe(false);
  });
});
