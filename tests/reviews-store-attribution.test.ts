// @vitest-environment node
/**
 * v3.7 review → store attribution on POST /api/reviews:
 *  - a review credits the SELLING store (supplierId from the storefront
 *    context; falls back to the catalog owner when absent)
 *  - the credited store's suppliers.rating/reviews roll up from its
 *    attributed reviews (avg + count)
 *  - pre-migration schemas (no reviews.supplier_id column) still accept
 *    the review — attribution is dropped, not the review
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authedUser: { id: string } | null = null;
let productOwnerId: number | null = 42;                     // products.supplier_id fallback
let storeReviewRows: { rating: number }[] = [];             // reviews attributed to the store
let productReviewRows: { rating: number }[] = [];           // all reviews on the product
let failUpsertWithMissingColumn = false;                    // simulate pre-v3.7 schema
const upsertPayloads: Record<string, unknown>[] = [];
let productUpdate: Record<string, unknown> | null = null;
let supplierUpdate: { payload: Record<string, unknown>; id?: unknown } | null = null;

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  let lastEqCol = '';
  let updating: Record<string, unknown> | null = null;
  let upserted: Record<string, unknown> | null = null;
  b.select = () => b;
  b.in = () => b; b.order = () => b; b.limit = () => b;
  b.eq = (col: string, val: unknown) => {
    lastEqCol = col;
    if (updating && table === 'suppliers') supplierUpdate = { payload: updating, id: val };
    return b;
  };
  b.upsert = (payload: Record<string, unknown>) => {
    // clone — the route mutates the same object between retries
    upsertPayloads.push({ ...payload });
    if (failUpsertWithMissingColumn && 'supplier_id' in payload) {
      upserted = null; // this attempt errors below
    } else {
      upserted = payload;
    }
    return b;
  };
  b.update = (payload: Record<string, unknown>) => {
    updating = payload;
    if (table === 'products') productUpdate = payload;
    return b;
  };
  b.single = () => (upserted
    ? Promise.resolve({ data: { id: 1, created_at: '2026-07-11T10:00:00Z', ...upserted }, error: null })
    : Promise.resolve({ data: null, error: { code: '42703', message: 'column reviews.supplier_id does not exist' } }));
  b.maybeSingle = () => {
    if (table === 'products') return Promise.resolve({ data: { supplier_id: productOwnerId }, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  b.then = (res: (v: unknown) => void) => {
    let data: unknown = [];
    if (table === 'reviews') data = lastEqCol === 'supplier_id' ? storeReviewRows : productReviewRows;
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

import { POST } from '@/app/api/reviews/route';

const post = (body: object, tok = true) => new Request('http://t/api/reviews', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer jwt' } : {}) },
  body: JSON.stringify(body),
});

beforeEach(() => {
  authedUser = { id: 'reviewer-1' };
  productOwnerId = 42;
  storeReviewRows = [{ rating: 4 }, { rating: 2 }];
  productReviewRows = [{ rating: 4 }, { rating: 2 }];
  failUpsertWithMissingColumn = false;
  upsertPayloads.length = 0;
  productUpdate = null; supplierUpdate = null;
});

describe('POST /api/reviews — store attribution', () => {
  it('no token → 401', async () => {
    expect((await POST(post({ productId: 1, rating: 5 }, false))).status).toBe(401);
  });

  it('rating outside 1–5 → 400', async () => {
    expect((await POST(post({ productId: 1, rating: 9 }))).status).toBe(400);
  });

  it('storefront review is attributed to the given store', async () => {
    const res = await POST(post({ productId: 1, rating: 4, supplierId: 27 }));
    expect(res.status).toBe(201);
    expect(upsertPayloads[0]).toMatchObject({ supplier_id: 27, rating: 4 });
    expect((await res.json()).supplierId).toBe(27);
  });

  it('no store context → falls back to the catalog owner', async () => {
    await POST(post({ productId: 1, rating: 4 }));
    expect(upsertPayloads[0]).toMatchObject({ supplier_id: 42 });
  });

  it('recalculates the product rating from ALL its reviews', async () => {
    await POST(post({ productId: 1, rating: 4, supplierId: 27 }));
    expect(productUpdate).toMatchObject({ rating: 3, reviews: 2 }); // avg(4,2)=3
  });

  it("rolls the store's ATTRIBUTED reviews into suppliers.rating/reviews", async () => {
    storeReviewRows = [{ rating: 5 }, { rating: 4 }, { rating: 3 }];
    await POST(post({ productId: 1, rating: 5, supplierId: 27 }));
    expect(supplierUpdate?.payload).toMatchObject({ rating: 4, reviews: 3 }); // avg(5,4,3)=4
    expect(supplierUpdate?.id).toBe(27);
  });

  it('pre-migration schema (no supplier_id column): review still saves', async () => {
    failUpsertWithMissingColumn = true;
    const res = await POST(post({ productId: 1, rating: 4, supplierId: 27 }));
    expect(res.status).toBe(201);
    // first attempt carried the attribution, the retry dropped it
    expect(upsertPayloads).toHaveLength(2);
    expect(upsertPayloads[0]).toHaveProperty('supplier_id', 27);
    expect(upsertPayloads[1]).not.toHaveProperty('supplier_id');
  });
});
