// @vitest-environment node
/**
 * Regression guard: products/[id] and business-products/[id] PATCH/DELETE
 * used to gate on `requireStaff` alone — ANY business/supplier account
 * (not just the actual owner) could edit or delete ANOTHER store's products,
 * or reprice/unclaim a competitor's claimed listing. `requireProductOwner`
 * and `requireClaimOwner` close that; this locks the fix in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authedUser: { id: string } | null = null;
let adminRole: 'admin' | 'semi_admin' | null = null;
let productOwner: string | null = 'ownerA';       // products.supplier_id → resolved to this auth_user_id
let productSupplierId: number | null = 31;        // the product's supplier_id (null = ownerless)
let claimSupplierId: number | null = 31;           // business_products.supplier_id
let claimSupplierOwner: string | null = 'ownerA';  // that supplier's auth_user_id

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'insert', 'delete']) b[m] = () => b;
  b.maybeSingle = () => {
    if (table === 'admins')    return Promise.resolve({ data: adminRole ? { role: adminRole, user_id: authedUser?.id } : null, error: null });
    if (table === 'products')  return Promise.resolve({ data: productSupplierId != null ? { supplier_id: productSupplierId } : null, error: null });
    if (table === 'suppliers') return Promise.resolve({ data: { auth_user_id: productOwner }, error: null });
    if (table === 'business_products') return Promise.resolve({ data: { supplier_id: claimSupplierId }, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  return b;
}

// ownsStoreOrAdmin resolves `suppliers` by whichever supplierId it's asked
// about — products vs business_products own checks pass DIFFERENT ids, so the
// mock needs to answer per-id, not per-table. Route both through one table
// with an id-aware maybeSingle.
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: async (t: string) => (t && authedUser ? { data: { user: authedUser }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    from: (table: string) => {
      if (table === 'suppliers') {
        const b: Record<string, unknown> = {};
        let lastId: number | null = null;
        for (const m of ['select']) b[m] = () => b;
        b.eq = (col: string, val: unknown) => { if (col === 'id') lastId = val as number; return b; };
        b.maybeSingle = () => {
          // suppliers.id === productSupplierId → owned-product's supplier row
          // suppliers.id === claimSupplierId   → claim's supplier row
          if (lastId === productSupplierId) return Promise.resolve({ data: { auth_user_id: productOwner }, error: null });
          if (lastId === claimSupplierId)   return Promise.resolve({ data: { auth_user_id: claimSupplierOwner }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        return b;
      }
      return builder(table);
    },
  }),
}));

import { requireProductOwner, requireClaimOwner } from '@/lib/apiAuth';

const authed = () => new Request('http://t/x', { headers: { Authorization: 'Bearer jwt' } });
const anon   = () => new Request('http://t/x');

beforeEach(() => {
  authedUser = null; adminRole = null;
  productOwner = 'ownerA'; productSupplierId = 31;
  claimSupplierId = 31; claimSupplierOwner = 'ownerA';
});

describe('requireProductOwner — products/[id] PATCH & DELETE', () => {
  it('no token → 401', async () => {
    expect((await requireProductOwner(anon(), 1))?.status).toBe(401);
  });
  it('product row does not exist → 404', async () => {
    authedUser = { id: 'ownerA' };
    productSupplierId = null; // mock: products.maybeSingle() returns no row
    expect((await requireProductOwner(authed(), 999))?.status).toBe(404);
  });
  it('owner editing their own product → allowed (null)', async () => {
    authedUser = { id: 'ownerA' };
    expect(await requireProductOwner(authed(), 1)).toBeNull();
  });
  it('a DIFFERENT signed-in store → 403 (the core regression)', async () => {
    authedUser = { id: 'rival-store-owner' };
    expect((await requireProductOwner(authed(), 1))?.status).toBe(403);
  });
  it('admin can touch any product → allowed', async () => {
    authedUser = { id: 'boss' }; adminRole = 'admin';
    expect(await requireProductOwner(authed(), 1)).toBeNull();
  });
});

describe('requireClaimOwner — business-products/[id] PATCH & DELETE', () => {
  it('no token → 401', async () => {
    expect((await requireClaimOwner(anon(), 1))?.status).toBe(401);
  });
  it('the claiming business editing their own claim → allowed', async () => {
    authedUser = { id: 'ownerA' };
    expect(await requireClaimOwner(authed(), 1)).toBeNull();
  });
  it('a DIFFERENT store trying to reprice/unclaim someone else\'s claim → 403', async () => {
    authedUser = { id: 'rival-store-owner' };
    expect((await requireClaimOwner(authed(), 1))?.status).toBe(403);
  });
  it('admin can touch any claim → allowed', async () => {
    authedUser = { id: 'boss' }; adminRole = 'admin';
    expect(await requireClaimOwner(authed(), 1)).toBeNull();
  });
});
