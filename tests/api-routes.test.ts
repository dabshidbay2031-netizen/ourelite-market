// @vitest-environment node
/**
 * API route handlers — input validation, server-authoritative order
 * placement, and snake_case → camelCase response mapping.
 *
 * Supabase is mocked: tests assert the route logic, not the database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Chainable supabase mock ─────────────────────────────────── */

type SbResult = { data: unknown; error: unknown };

let fromResults: Record<string, SbResult> = {};
let rpcResult: SbResult = { data: null, error: { code: 'PGRST202', message: 'function not found' } };

function makeBuilder(result: SbResult) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'insert']) {
    b[m] = () => b;
  }
  b.maybeSingle = () => Promise.resolve(result);
  b.single      = () => Promise.resolve(result);
  // awaiting the builder itself resolves the result (supabase-js style)
  (b as { then?: unknown }).then =
    (res: (v: SbResult) => void) => Promise.resolve(result).then(res);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => makeBuilder(fromResults[table] ?? { data: null, error: null }),
    rpc:  () => Promise.resolve(rpcResult),
  }),
}));

import { POST as ordersPost } from '@/app/api/orders/route';
import { GET as productsGet } from '@/app/api/products/route';
import { GET as suppliersGet } from '@/app/api/suppliers/route';

beforeEach(() => {
  fromResults = {};
  rpcResult   = { data: null, error: { code: 'PGRST202', message: 'function not found' } };
});

const post = (body: unknown) =>
  ordersPost(new Request('http://test/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

/* ── POST /api/orders — validation ───────────────────────────── */

describe('POST /api/orders input validation', () => {
  it('malformed JSON → 400', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
  });

  it('missing items → 400', async () => {
    const res = await post({ customerName: 'A' });
    expect(res.status).toBe(400);
  });

  it('empty items array → 400', async () => {
    const res = await post({ items: [] });
    expect(res.status).toBe(400);
  });

  it('zero quantity → 400', async () => {
    const res = await post({ items: [{ id: 1, qty: 0 }] });
    expect(res.status).toBe(400);
  });

  it('negative quantity → 400', async () => {
    const res = await post({ items: [{ id: 1, qty: -5 }] });
    expect(res.status).toBe(400);
  });

  it('quantity above 10000 → 400', async () => {
    const res = await post({ items: [{ id: 1, qty: 10001 }] });
    expect(res.status).toBe(400);
  });

  it('non-integer product id → 400', async () => {
    const res = await post({ items: [{ id: 'abc', qty: 1 }] });
    expect(res.status).toBe(400);
  });

  it('more than 100 line items → 400', async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, qty: 1 }));
    const res = await post({ items });
    expect(res.status).toBe(400);
  });
});

/* ── POST /api/orders — atomic RPC path ──────────────────────── */

describe('POST /api/orders place_order RPC', () => {
  const orderRow = {
    id: 'ORD-TEST-1', customer_name: 'Ayan', customer_phone: '+25261',
    user_id: null, items: [{ id: 1, qty: 2 }],
    subtotal: 20, discount: 0, total: 20,
    payment_method: 'cash', status: 'pending', notes: null,
    created_at: '2026-06-13T00:00:00Z',
  };

  it('RPC success → 201 with camelCase order', async () => {
    rpcResult = { data: orderRow, error: null };
    const res  = await post({ customerName: 'Ayan', items: [{ id: 1, qty: 2 }] });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      id: 'ORD-TEST-1',
      customerName: 'Ayan',
      paymentMethod: 'cash',
      total: 20,
      status: 'pending',
    });
    // server-authoritative: no snake_case leaks
    expect(body.customer_name).toBeUndefined();
  });

  it('RPC stock failure → 409, order rejected', async () => {
    rpcResult = { data: null, error: { code: 'P0001', message: 'Insufficient stock for product 1' } };
    const res = await post({ items: [{ id: 1, qty: 99 }] });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/stock/i);
  });
});

/* ── GET /api/products — mapping + filters ───────────────────── */

const productRow = {
  id: 1, name: 'Solar Lamp', price: 9.99, original_price: 14.99,
  category: 'electronics', sub_category: 'lighting', icon: '💡',
  stock: 12, sku: 'SL-1', supplier_id: 3, rating: 4.5, reviews: 10,
  sold: 80, description: 'Bright', barcode: '123', tags: ['solar'],
  brand: 'Sunny', image_url: 'http://img/1.jpg', image_urls: [],
  price_tiers: [], is_b2b: false, moq: 1,
};

describe('GET /api/products', () => {
  it('maps DB rows to the client shape (camelCase)', async () => {
    fromResults.products = { data: [productRow], error: null };
    const res  = await productsGet(new Request('http://test/api/products'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 1,
      name: 'Solar Lamp',
      originalPrice: 14.99,
      subCategory: 'lighting',
      supplierId: 3,
      imageUrl: 'http://img/1.jpg',
      isB2b: false,
    });
    expect(body[0].original_price).toBeUndefined();
  });

  it('DB unreachable → empty list, never a crash', async () => {
    fromResults.products = { data: null, error: { message: 'dns fail' } };
    const res  = await productsGet(new Request('http://test/api/products'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('?category= filters server-side', async () => {
    fromResults.products = {
      data: [productRow, { ...productRow, id: 2, category: 'food' }],
      error: null,
    };
    const res  = await productsGet(new Request('http://test/api/products?category=food'));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(2);
  });

  it('?q= searches name/brand/tags', async () => {
    fromResults.products = {
      data: [productRow, { ...productRow, id: 2, name: 'Desk Fan', brand: 'Breeze', tags: [] }],
      error: null,
    };
    const res  = await productsGet(new Request('http://test/api/products?q=breeze'));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(2);
  });
});

/* ── GET /api/suppliers?slug= — storefront lookup ────────────── */

describe('GET /api/suppliers?slug=', () => {
  it('known slug → supplier mapped to client shape', async () => {
    fromResults.suppliers = {
      data: {
        id: 7, name: 'TechVault', rating: 5, reviews: 2, location: 'Mogadishu',
        min_order: 0, categories: [], icon: '🏭', description: '',
        product_ids: [], discount: 0, delivery_days: '3-5', verified: true,
        badge: '', bio: '', contact_numbers: [], auth_user_id: 'u1',
        account_type: 'supplier',
      },
      error: null,
    };
    const res  = await suppliersGet(new Request('http://test/api/suppliers?slug=techvault'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: 7, name: 'TechVault', accountType: 'supplier' });
  });

  it('unknown slug → 404', async () => {
    fromResults.suppliers = { data: null, error: null };
    const res = await suppliersGet(new Request('http://test/api/suppliers?slug=nope'));
    expect(res.status).toBe(404);
  });
});
