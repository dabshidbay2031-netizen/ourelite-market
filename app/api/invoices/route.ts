import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireSupplierAccess } from '@/lib/apiAuth';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

/**
 * Credit-customer invoices (receivables ledger, v3.7).
 *
 * A business invoices a customer who pays later (e.g. monthly): the invoice
 * holds an item snapshot + total, payments are recorded against it over time
 * (see /api/invoices/[id]), and the outstanding balance is total − paid.
 * Needs supabase/migration_v3_7.sql.
 */

interface InvoiceItem { id: number; name: string; price: number; qty: number; }

function mapInvoice(v: Record<string, unknown>) {
  const payments = Array.isArray(v.invoice_payments) ? v.invoice_payments : [];
  return {
    id:           v.id,
    supplierId:   v.supplier_id,
    customerId:   String(v.customer_id),
    customerName: v.customer_name ?? '',
    items:        v.items ?? [],
    subtotal:     Number(v.subtotal ?? 0),
    discount:     Number(v.discount ?? 0),
    total:        Number(v.total ?? 0),
    paidTotal:    Number(v.paid_total ?? 0),
    balance:      Math.round((Number(v.total ?? 0) - Number(v.paid_total ?? 0)) * 100) / 100,
    status:       v.status ?? 'unpaid',
    notes:        v.notes ?? null,
    orderId:      v.order_id ?? null,
    createdAt:    v.created_at,
    payments: payments.map((p: Record<string, unknown>) => ({
      id:     p.id,
      amount: Number(p.amount ?? 0),
      method: p.method ?? 'cash',
      note:   p.note ?? null,
      paidAt: p.paid_at,
    })).sort((a: { paidAt: string }, b: { paidAt: string }) => String(a.paidAt).localeCompare(String(b.paidAt))),
  };
}

function newInvoiceId(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${ts}-${rand}`;
}

/** GET /api/invoices?supplierId=X[&customerId=Y] — a store's invoice ledger. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supplierId = parseInt(searchParams.get('supplierId') ?? '', 10);
  const customerId = searchParams.get('customerId');
  if (Number.isNaN(supplierId)) {
    return NextResponse.json({ error: 'supplierId required' }, { status: 400 });
  }
  const denied = await requireSupplierAccess(req, supplierId);
  if (denied) return denied;

  try {
    let query = getSupabaseAdmin()
      .from('invoices')
      .select('*, invoice_payments(*)')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false });
    if (customerId) query = query.eq('customer_id', customerId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json((data ?? []).map(v => mapInvoice(v as Record<string, unknown>)));
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/**
 * POST /api/invoices — create an invoice for a customer.
 * Body: { supplierId, customerId, customerName, items:[{id,name,price,qty}],
 *         discount?, notes?, orderId? }
 * Prices are the store's own (it invoices at ITS price, incl. claim pricing);
 * the caller must own the store, so there is no client-pricing risk here.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supplierId = Number(body.supplierId);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: 'supplierId required' }, { status: 400 });
  }
  const denied = await requireSupplierAccess(req, supplierId);
  if (denied) return denied;

  const customerId = String(body.customerId ?? '').trim();
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 });

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: InvoiceItem[] = [];
  for (const it of rawItems) {
    const r     = it as Record<string, unknown>;
    const id    = Number(r.id);
    const qty   = Number(r.qty ?? 1);
    const price = Number(r.price ?? 0);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty <= 0 || qty > 10000) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    items.push({ id, name: String(r.name ?? `#${id}`).slice(0, 200), price, qty });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: 'items must contain at least one valid { id, name, price, qty }' }, { status: 400 });
  }

  const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const discount = Math.min(Math.max(Number(body.discount) || 0, 0), subtotal);
  const total    = Math.round((subtotal - discount) * 100) / 100;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('invoices')
      .insert({
        id:            newInvoiceId(),
        supplier_id:   supplierId,
        customer_id:   customerId,
        customer_name: String(body.customerName ?? '').slice(0, 200),
        items,
        subtotal,
        discount,
        total,
        paid_total:    0,
        status:        'unpaid',
        notes:         body.notes != null ? String(body.notes).slice(0, 2000) : null,
        order_id:      body.orderId != null ? String(body.orderId) : null,
      })
      .select('*, invoice_payments(*)')
      .single();
    if (error) throw error;
    return NextResponse.json(mapInvoice(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: 'invoices table missing — run supabase/migration_v3_7.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
