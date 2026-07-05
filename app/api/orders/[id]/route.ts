import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAuthUser } from '@/lib/apiAuth';

/**
 * Order management (status change, soft-delete) is a SELLER/admin action.
 * Allowed for platform admins, or a store that actually sells at least one
 * product in the order — NOT for a business that merely placed the order as a
 * buyer. (GET stays public so shared receipt QR codes keep resolving.)
 */
async function requireOrderSeller(req: Request, orderId: string): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();

  const { data: admin } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (admin) return null;

  const { data: sup } = await sb.from('suppliers').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!sup) return NextResponse.json({ error: 'Forbidden — store access required' }, { status: 403 });
  const supplierId = sup.id as number;

  const { data: ord } = await sb.from('orders').select('items').eq('id', orderId).maybeSingle();
  if (!ord) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const itemIds = (Array.isArray(ord.items) ? ord.items as Array<{ id: number }> : [])
    .map(i => Number(i.id)).filter(n => Number.isInteger(n) && n > 0);
  if (itemIds.length === 0) return NextResponse.json({ error: 'Forbidden — not your order' }, { status: 403 });

  // Seller iff the order contains a product this store OWNS or CLAIMS.
  const [{ data: owned }, { data: claimed }] = await Promise.all([
    sb.from('products').select('id').eq('supplier_id', supplierId).in('id', itemIds),
    sb.from('business_products').select('product_id').eq('supplier_id', supplierId).in('product_id', itemIds),
  ]);
  if ((owned && owned.length) || (claimed && claimed.length)) return null;
  return NextResponse.json({ error: 'Forbidden — you are not the seller of this order' }, { status: 403 });
}

function mapOrder(o: Record<string, unknown>) {
  return {
    id:            o.id,
    customerName:  o.customer_name,
    customerPhone: o.customer_phone,
    userId:        o.user_id        ?? null,
    items:         o.items,
    subtotal:      o.subtotal,
    discount:      o.discount,
    total:         o.total,
    paymentMethod: o.payment_method,
    status:        o.status,
    notes:         o.notes          ?? null,
    sessionId:     o.session_id     ?? null,
    cashierName:   o.cashier_name   ?? null,
    createdAt:     o.created_at,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { data, error } = await getSupabaseAdmin()
    .from('orders').select('*').eq('id', (await params).id).single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(mapOrder(data));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orderId = (await params).id;
  const denied = await requireOrderSeller(req, orderId);
  if (denied) return denied;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.status        !== undefined) updates.status         = body.status;
  if (body.customerName  !== undefined) updates.customer_name  = body.customerName;
  if (body.customerPhone !== undefined) updates.customer_phone = body.customerPhone;
  // Only include notes if it exists (old schema may not have it)
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('orders').update(updates).eq('id', orderId).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json(mapOrder(data as Record<string, unknown>));
}

/**
 * RULE: orders are NEVER physically deleted. "Delete" marks the order
 * status as 'deleted' — it stays in the history (labeled), keeps its
 * receipt/QR resolvable, and is excluded from all revenue figures
 * (see lib/revenue.ts). There is intentionally no hard-delete path.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orderId = (await params).id;
  const denied = await requireOrderSeller(req, orderId);
  if (denied) return denied;

  const { data, error } = await getSupabaseAdmin()
    .from('orders')
    .update({ status: 'deleted' })
    .eq('id', orderId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({ success: true, softDeleted: true, order: mapOrder(data as Record<string, unknown>) });
}
