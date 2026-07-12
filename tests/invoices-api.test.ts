// @vitest-environment node
/**
 * v3.7 credit-customer invoices (/api/invoices):
 *  - POST validates auth, tenant ownership, items, and computes the math
 *    server-side (subtotal / clamped discount / total)
 *  - PATCH records payments: capped at the balance, moves status
 *    unpaid → partial → paid, and rejects payments on a settled invoice
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authedUser: { id: string } | null = null;
let adminRow = false;
let ownsStore = true;                       // caller owns the store they target
let invoiceRow: Record<string, unknown>;    // row behind /api/invoices/[id]
let insertedInvoice: Record<string, unknown> | null = null;
let insertedPayment: Record<string, unknown> | null = null;
let updatedInvoice: Record<string, unknown> | null = null;

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  let inserting = false, updating = false;
  for (const m of ['eq', 'in', 'order', 'limit'] as const) b[m] = () => b;
  b.select = () => b;
  b.or = () => b;
  b.insert = (payload: Record<string, unknown>) => {
    inserting = true;
    if (table === 'invoices') insertedInvoice = payload;
    if (table === 'invoice_payments') insertedPayment = payload;
    return b;
  };
  b.update = (payload: Record<string, unknown>) => { updating = true; updatedInvoice = payload; return b; };
  b.single = () => {
    if (table === 'invoices' && inserting) return Promise.resolve({ data: { ...insertedInvoice, invoice_payments: [] }, error: null });
    if (table === 'invoices' && updating)  return Promise.resolve({ data: { ...invoiceRow, ...updatedInvoice, invoice_payments: [] }, error: null });
    return Promise.resolve({ data: null, error: { message: 'not found' } });
  };
  b.maybeSingle = () => {
    if (table === 'admins')    return Promise.resolve({ data: adminRow ? { user_id: authedUser?.id } : null, error: null });
    if (table === 'suppliers') return Promise.resolve({ data: ownsStore ? { id: 27, auth_user_id: authedUser?.id } : null, error: null });
    if (table === 'invoices')  return Promise.resolve({ data: invoiceRow, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  b.then = (res: (v: unknown) => void) => {
    // invoice_payments insert is awaited directly
    if (table === 'invoice_payments' && inserting) return Promise.resolve({ error: null }).then(res);
    return Promise.resolve({ data: [], error: null }).then(res);
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: async (t: string) => (t && authedUser ? { data: { user: authedUser }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    from: (table: string) => builder(table),
  }),
}));

import { POST } from '@/app/api/invoices/route';
import { PATCH } from '@/app/api/invoices/[id]/route';

const params = { params: Promise.resolve({ id: 'INV-1' }) };
const post = (body: object, tok = true) => new Request('http://t/api/invoices', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer jwt' } : {}) },
  body: JSON.stringify(body),
});
const pay = (payment: object) => new Request('http://t/api/invoices/INV-1', {
  method: 'PATCH',
  headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
  body: JSON.stringify({ payment }),
});

const validBody = {
  supplierId: 27, customerId: 'c1', customerName: 'Ayan',
  items: [{ id: 9, name: 'Solar Lamp', price: 9.99, qty: 2 }],
  discount: 1,
};

beforeEach(() => {
  authedUser = { id: 'ownerA' }; adminRow = false; ownsStore = true;
  insertedInvoice = null; insertedPayment = null; updatedInvoice = null;
  invoiceRow = { id: 'INV-1', supplier_id: 27, customer_id: 'c1', customer_name: 'Ayan',
    items: [], subtotal: 20, discount: 0, total: 20, paid_total: 0, status: 'unpaid',
    invoice_payments: [], created_at: '2026-07-11T10:00:00Z' };
});

describe('POST /api/invoices — create a receivable', () => {
  it('no token → 401', async () => {
    expect((await POST(post(validBody, false))).status).toBe(401);
  });

  it('caller who does not own the store → 403', async () => {
    ownsStore = false;
    expect((await POST(post(validBody))).status).toBe(403);
  });

  it('empty items → 400', async () => {
    expect((await POST(post({ ...validBody, items: [] }))).status).toBe(400);
  });

  it('items with invalid ids/qtys are dropped; nothing valid → 400', async () => {
    const res = await POST(post({ ...validBody, items: [{ id: 'x', qty: 0 }, { id: -1, qty: 1 }] }));
    expect(res.status).toBe(400);
  });

  it('computes subtotal / discount / total server-side', async () => {
    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subtotal).toBe(19.98);     // 2 × 9.99
    expect(body.discount).toBe(1);
    expect(body.total).toBe(18.98);
    expect(body.balance).toBe(18.98);      // nothing paid yet
    expect(body.status).toBe('unpaid');
  });

  it('discount larger than the subtotal is clamped (total never negative)', async () => {
    const res = await POST(post({ ...validBody, discount: 999 }));
    const body = await res.json();
    expect(body.discount).toBe(19.98);
    expect(body.total).toBe(0);
  });
});

describe('PATCH /api/invoices/[id] — record payments', () => {
  it('overpayment is rejected (400)', async () => {
    expect((await PATCH(pay({ amount: 25, method: 'cash' }), params)).status).toBe(400);
  });

  it('zero / negative amounts are rejected (400)', async () => {
    expect((await PATCH(pay({ amount: 0 }), params)).status).toBe(400);
    expect((await PATCH(pay({ amount: -5 }), params)).status).toBe(400);
  });

  it('partial payment → status "partial", balance drops', async () => {
    const res = await PATCH(pay({ amount: 10, method: 'waafi' }), params);
    expect(res.status).toBe(200);
    expect(insertedPayment).toMatchObject({ invoice_id: 'INV-1', amount: 10, method: 'waafi' });
    expect(updatedInvoice).toMatchObject({ paid_total: 10, status: 'partial' });
    const body = await res.json();
    expect(body.balance).toBe(10);
  });

  it('final payment → status "paid", balance 0', async () => {
    invoiceRow.paid_total = 10;
    const res = await PATCH(pay({ amount: 10, method: 'cash' }), params);
    expect(res.status).toBe(200);
    expect(updatedInvoice).toMatchObject({ paid_total: 20, status: 'paid' });
    expect((await res.json()).balance).toBe(0);
  });

  it('paying a settled invoice → 409', async () => {
    invoiceRow.paid_total = 20;
    expect((await PATCH(pay({ amount: 1 }), params)).status).toBe(409);
  });

  it('another store cannot pay against my invoice (403)', async () => {
    ownsStore = false;
    expect((await PATCH(pay({ amount: 5 }), params)).status).toBe(403);
  });

  it('unknown payment methods fall back to cash', async () => {
    await PATCH(pay({ amount: 5, method: 'bitcoin' }), params);
    expect(insertedPayment).toMatchObject({ method: 'cash' });
  });
});
