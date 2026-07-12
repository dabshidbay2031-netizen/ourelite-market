// @vitest-environment node
/**
 * v3.7 order → store attribution on GET /api/orders?supplierId=X.
 *
 * The dashboard bug: orders used to be matched by product id only, so every
 * store claiming the same catalog product "saw" each other's sales. Now an
 * attributed order (orders.supplier_id) belongs ONLY to the store that sold
 * it; legacy rows (no attribution) still fall back to item matching.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authedUser: { id: string } | null = null;
let adminRow = false;
let storeOwner: string | null = 'ownerA';   // suppliers.auth_user_id for the queried store
let ownedProducts: { id: number }[] = [];
let claimedProducts: { product_id: number }[] = [];
let orderRows: Record<string, unknown>[] = [];

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is'] as const) b[m] = () => b;
  b.maybeSingle = () => {
    if (table === 'admins')    return Promise.resolve({ data: adminRow ? { user_id: authedUser?.id } : null, error: null });
    if (table === 'suppliers') return Promise.resolve({ data: storeOwner ? { auth_user_id: storeOwner } : null, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  b.then = (res: (v: unknown) => void) => {
    const data = table === 'products' ? ownedProducts
      : table === 'business_products' ? claimedProducts
      : table === 'orders' ? orderRows
      : [];
    return Promise.resolve({ data, error: null }).then(res);
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: async (t: string) => (t && authedUser ? { data: { user: authedUser }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    from: (table: string) => builder(table),
  }),
}));
vi.mock('@/lib/realtimeServer', () => ({ pingRealtime: vi.fn(), runAfterResponse: vi.fn() }));
vi.mock('@/lib/pushNotify', () => ({ sendPushToUsers: vi.fn(), sendPushToStores: vi.fn(), sellerStoreIds: vi.fn(async () => []) }));
vi.mock('@/lib/notify', () => ({ createNotifications: vi.fn() }));

import { GET } from '@/app/api/orders/route';

const req = () => new Request('http://t/api/orders?supplierId=27', { headers: { Authorization: 'Bearer jwt' } });

const order = (id: string, supplier_id: number | null, itemIds: number[]) => ({
  id, supplier_id, items: itemIds.map(i => ({ id: i, qty: 1 })),
  customer_name: 'X', customer_phone: '', subtotal: 1, discount: 0, total: 1,
  payment_method: 'cash', status: 'completed', created_at: '2026-07-11T10:00:00Z',
});

beforeEach(() => {
  authedUser = { id: 'ownerA' }; adminRow = false; storeOwner = 'ownerA';
  ownedProducts   = [{ id: 9 }];          // store 27 owns product 9
  claimedProducts = [{ product_id: 5 }];  // and claims product 5
  orderRows = [
    order('MINE-ATTRIBUTED',   27,   [777]),  // attributed to me — items irrelevant
    order('RIVAL-ATTRIBUTED',  35,   [9]),    // rival's sale of a product I also sell
    order('LEGACY-OWNED',      null, [9]),    // legacy row matching my owned product
    order('LEGACY-CLAIMED',    null, [5]),    // legacy row matching my claimed product
    order('LEGACY-FOREIGN',    null, [777]),  // legacy row with nothing of mine
  ];
});

describe('GET /api/orders?supplierId — attribution first, item match for legacy', () => {
  it('returns exactly the store\'s own sales', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { id: string }[]).map(o => o.id).sort();
    expect(ids).toEqual(['LEGACY-CLAIMED', 'LEGACY-OWNED', 'MINE-ATTRIBUTED'].sort());
  });

  it("another store's attributed sale of a shared claimed product is EXCLUDED", async () => {
    const body = (await (await GET(req())).json()) as { id: string }[];
    expect(body.find(o => o.id === 'RIVAL-ATTRIBUTED')).toBeUndefined();
  });

  it('an attributed order is included even when item matching would miss it', async () => {
    const body = (await (await GET(req())).json()) as { id: string }[];
    expect(body.find(o => o.id === 'MINE-ATTRIBUTED')).toBeDefined();
  });

  it('responses expose supplierId for the client', async () => {
    const body = (await (await GET(req())).json()) as { id: string; supplierId: number | null }[];
    expect(body.find(o => o.id === 'MINE-ATTRIBUTED')?.supplierId).toBe(27);
    expect(body.find(o => o.id === 'LEGACY-OWNED')?.supplierId).toBeNull();
  });
});
