import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

function mapOrder(o: Record<string, unknown>) {
  return {
    id: o.id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    userId: o.user_id ?? null,
    items: o.items,
    subtotal: o.subtotal,
    discount: o.discount,
    total: o.total,
    paymentMethod: o.payment_method,
    status: o.status,
    notes: o.notes ?? null,
    createdAt: o.created_at,
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data, error } = await getSupabaseAdmin()
    .from('orders').select('*').eq('id', params.id).single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(mapOrder(data));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
    .from('orders').update(updates).eq('id', params.id).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json(mapOrder(data as Record<string, unknown>));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await getSupabaseAdmin().from('orders').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
