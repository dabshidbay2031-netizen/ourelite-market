// @vitest-environment node
/**
 * v3.7 order rules on /api/orders/[id]:
 *  - GET masks customer PII (name/phone/notes/userId) for anyone who is not
 *    the buyer, the selling store, or an admin — receipt QR scans stay safe
 *  - PATCH only moves an order FORWARD through fulfillment
 *    (pending → processing → shipped → completed; cancel/refund allowed from
 *    any live stage; terminal orders are frozen)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authedUser: { id: string } | null = null;
let adminRow = false;
let callerSupplierId: number | null = null;                  // caller's suppliers row
let orderRow: Record<string, unknown> = {};
let ownedProducts: { id: number }[] = [];                    // products the caller's store owns
let claimedProducts: { product_id: number }[] = [];          // ...or claims
let updatedPayload: Record<string, unknown> | null = null;   // captured orders.update()

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  let selected = '';
  let updating = false;
  for (const m of ['eq', 'in', 'order', 'limit', 'neq', 'is', 'insert', 'upsert', 'delete']) b[m] = () => b;
  b.select = (arg?: string) => { selected = arg ?? ''; return b; };
  b.update = (payload: Record<string, unknown>) => { updating = true; updatedPayload = payload; return b; };
  b.single = () => (table === 'orders'
    ? Promise.resolve({ data: orderRow, error: null })
    : Promise.resolve({ data: null, error: { message: 'not found' } }));
  b.maybeSingle = () => {
    if (table === 'admins')    return Promise.resolve({ data: adminRow ? { user_id: authedUser?.id } : null, error: null });
    if (table === 'suppliers') return Promise.resolve({ data: callerSupplierId != null ? { id: callerSupplierId, auth_user_id: authedUser?.id } : null, error: null });
    if (table === 'orders') {
      if (updating)             return Promise.resolve({ data: { ...orderRow, ...updatedPayload }, error: null });
      if (selected === 'items') return Promise.resolve({ data: { items: orderRow.items }, error: null });
      if (selected === 'status')return Promise.resolve({ data: { status: orderRow.status }, error: null });
      return Promise.resolve({ data: orderRow, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  b.then = (res: (v: unknown) => void) => {
    const data = table === 'products' ? ownedProducts
      : table === 'business_products' ? claimedProducts
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

import { GET, PATCH } from '@/app/api/orders/[id]/route';

const params = { params: Promise.resolve({ id: 'O1' }) };
const getReq   = (tok: boolean) => new Request('http://t/api/orders/O1', tok ? { headers: { Authorization: 'Bearer jwt' } } : {});
const patchReq = (status: string) => new Request('http://t/api/orders/O1', {
  method: 'PATCH',
  headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
  body: JSON.stringify({ status }),
});

beforeEach(() => {
  authedUser = null; adminRow = false; callerSupplierId = null;
  ownedProducts = [{ id: 9 }]; claimedProducts = [];
  updatedPayload = null;
  orderRow = {
    id: 'O1', customer_name: 'Amina Yusuf', customer_phone: '+252611234567',
    user_id: 'buyer-1', items: [{ id: 9, qty: 1 }], subtotal: 10, discount: 0, total: 10,
    payment_method: 'cash', status: 'pending', notes: 'Deliver to Hodan, blue gate',
    supplier_id: 27, created_at: '2026-07-11T10:00:00Z',
  };
});

describe('GET /api/orders/[id] — customer PII masking', () => {
  it('anonymous (scanned QR) gets masked name/phone and no notes/userId', async () => {
    const body = await (await GET(getReq(false), params)).json();
    expect(body.masked).toBe(true);
    expect(body.customerName).toBe('A.');
    expect(body.customerPhone).toBe('•••••67');
    expect(body.customerPhone).not.toContain('1234');
    expect(body.notes).toBeNull();
    expect(body.userId).toBeNull();
    // status + totals stay usable for tracking
    expect(body.status).toBe('pending');
    expect(body.total).toBe(10);
  });

  it('the buyer sees their own details in full', async () => {
    authedUser = { id: 'buyer-1' };
    const body = await (await GET(getReq(true), params)).json();
    expect(body.masked).toBeUndefined();
    expect(body.customerName).toBe('Amina Yusuf');
    expect(body.notes).toBe('Deliver to Hodan, blue gate');
  });

  it('the selling store (order attribution) sees full details', async () => {
    authedUser = { id: 'ownerA' }; callerSupplierId = 27;
    const body = await (await GET(getReq(true), params)).json();
    expect(body.masked).toBeUndefined();
    expect(body.customerPhone).toBe('+252611234567');
  });

  it('legacy order (no attribution): item-matched seller sees full details', async () => {
    orderRow.supplier_id = null;
    authedUser = { id: 'ownerA' }; callerSupplierId = 27; ownedProducts = [{ id: 9 }];
    const body = await (await GET(getReq(true), params)).json();
    expect(body.masked).toBeUndefined();
  });

  it('a signed-in stranger is still masked', async () => {
    authedUser = { id: 'random-shopper' }; callerSupplierId = null;
    const body = await (await GET(getReq(true), params)).json();
    expect(body.masked).toBe(true);
  });

  it('another store that does NOT sell the items is masked', async () => {
    authedUser = { id: 'rival' }; callerSupplierId = 35; ownedProducts = []; claimedProducts = [];
    const body = await (await GET(getReq(true), params)).json();
    expect(body.masked).toBe(true);
  });

  it('a platform admin sees full details', async () => {
    authedUser = { id: 'boss' }; adminRow = true; callerSupplierId = null;
    const body = await (await GET(getReq(true), params)).json();
    expect(body.masked).toBeUndefined();
  });
});

describe('PATCH /api/orders/[id] — forward-only status', () => {
  beforeEach(() => { authedUser = { id: 'ownerA' }; callerSupplierId = 27; });

  it('pending → processing advances (200)', async () => {
    expect((await PATCH(patchReq('processing'), params)).status).toBe(200);
    expect(updatedPayload).toMatchObject({ status: 'processing' });
  });

  it('processing → pending is rejected (409)', async () => {
    orderRow.status = 'processing';
    const res = await PATCH(patchReq('pending'), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/can't move back/i);
  });

  it('completed → shipped is rejected (409)', async () => {
    orderRow.status = 'completed';
    expect((await PATCH(patchReq('shipped'), params)).status).toBe(409);
  });

  it('a live order can still be cancelled (200)', async () => {
    orderRow.status = 'shipped';
    expect((await PATCH(patchReq('cancelled'), params)).status).toBe(200);
  });

  it('a cancelled order is frozen (409)', async () => {
    orderRow.status = 'cancelled';
    expect((await PATCH(patchReq('processing'), params)).status).toBe(409);
  });

  it('a deleted order cannot be revived (409)', async () => {
    orderRow.status = 'deleted';
    expect((await PATCH(patchReq('completed'), params)).status).toBe(409);
  });

  it('bulk_pending may enter the pipeline (200)', async () => {
    orderRow.status = 'bulk_pending';
    expect((await PATCH(patchReq('processing'), params)).status).toBe(200);
  });

  it('a store that does not sell the items cannot touch the order (403)', async () => {
    callerSupplierId = 35; ownedProducts = []; claimedProducts = [];
    expect((await PATCH(patchReq('processing'), params)).status).toBe(403);
  });
});
