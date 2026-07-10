import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAuthUser, ownsStoreOrAdmin } from '@/lib/apiAuth';
import { errMsg } from '@/lib/apiHelpers';

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

/** The invoice row, or a Response when it doesn't exist / isn't the caller's. */
async function requireOwnInvoice(req: Request, invoiceId: string): Promise<Record<string, unknown> | Response> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  const { data } = await getSupabaseAdmin()
    .from('invoices').select('*, invoice_payments(*)').eq('id', invoiceId).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (!(await ownsStoreOrAdmin(user.id, Number(data.supplier_id)))) {
    return NextResponse.json({ error: 'Forbidden — not your invoice' }, { status: 403 });
  }
  return data as Record<string, unknown>;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const inv = await requireOwnInvoice(req, (await params).id);
  if (inv instanceof Response) return inv;
  return NextResponse.json(mapInvoice(inv));
}

/**
 * PATCH /api/invoices/[id] — record a payment against the invoice.
 * Body: { payment: { amount, method?, note? } }
 * Adds an invoice_payments row and moves paid_total/status forward
 * (unpaid → partial → paid). Amount is capped at the remaining balance.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const invoiceId = (await params).id;
  const inv = await requireOwnInvoice(req, invoiceId);
  if (inv instanceof Response) return inv;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const pay = (body.payment ?? null) as Record<string, unknown> | null;
  if (!pay) return NextResponse.json({ error: 'payment required' }, { status: 400 });

  const total   = Number(inv.total ?? 0);
  const paid    = Number(inv.paid_total ?? 0);
  const balance = Math.round((total - paid) * 100) / 100;
  if (balance <= 0) return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 409 });

  const amount = Math.round((Number(pay.amount) || 0) * 100) / 100;
  if (amount <= 0)      return NextResponse.json({ error: 'Payment amount must be positive' }, { status: 400 });
  if (amount > balance) return NextResponse.json({ error: `Payment exceeds the $${balance.toFixed(2)} balance` }, { status: 400 });

  const method = ['cash', 'waafi', 'card', 'sifalo'].includes(String(pay.method)) ? String(pay.method) : 'cash';

  try {
    const sb = getSupabaseAdmin();
    const { error: payErr } = await sb.from('invoice_payments').insert({
      invoice_id: invoiceId,
      amount,
      method,
      note: pay.note != null ? String(pay.note).slice(0, 500) : null,
    });
    if (payErr) throw payErr;

    const newPaid   = Math.round((paid + amount) * 100) / 100;
    const newStatus = newPaid >= total - 0.005 ? 'paid' : 'partial';
    const { data, error } = await sb
      .from('invoices')
      .update({ paid_total: newPaid, status: newStatus })
      .eq('id', invoiceId)
      .select('*, invoice_payments(*)')
      .single();
    if (error) throw error;
    return NextResponse.json(mapInvoice(data as Record<string, unknown>));
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
