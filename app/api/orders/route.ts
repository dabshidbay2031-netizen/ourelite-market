import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ORDERS } from '@/lib/seed-data';
import { errMsg, isMissingColumnError } from '@/lib/apiHelpers';

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
    createdAt:     o.created_at,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  try {
    let query = getSupabaseAdmin()
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data.map(mapOrder));
  } catch {
    if (userId) return NextResponse.json([]);
    return NextResponse.json(ORDERS);
  }
}

export async function POST(req: Request) {
  const body = await req.json();

  // Base payload — columns that exist in ALL schema versions
  const basePayload: Record<string, unknown> = {
    id:             body.id,
    customer_name:  body.customerName  ?? '',
    customer_phone: body.customerPhone ?? '',
    items:          body.items         ?? [],
    subtotal:       body.subtotal      ?? 0,
    discount:       body.discount      ?? 0,
    total:          body.total         ?? 0,
    payment_method: body.paymentMethod ?? 'cash',
    status:         body.status        ?? 'completed',
  };

  // Only add user_id if provided (avoids UUID type error on old schema)
  if (body.userId != null) basePayload.user_id = body.userId;

  // Phase 1: try with notes column (new schema)
  const fullPayload = { ...basePayload, notes: body.notes ?? null };

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('orders').insert(fullPayload).select().single();
    if (error) throw error;
    return NextResponse.json(mapOrder(data as Record<string, unknown>), { status: 201 });
  } catch (e1) {
    // Phase 2: notes column may not exist yet — insert without it
    if (isMissingColumnError(e1)) {
      try {
        const { data, error } = await getSupabaseAdmin()
          .from('orders').insert(basePayload).select().single();
        if (error) throw error;
        return NextResponse.json(mapOrder(data as Record<string, unknown>), { status: 201 });
      } catch (e2) {
        console.error('[orders POST phase2]', errMsg(e2));
        return NextResponse.json({ error: errMsg(e2) }, { status: 500 });
      }
    }
    console.error('[orders POST]', errMsg(e1));
    return NextResponse.json({ error: errMsg(e1) }, { status: 500 });
  }
}
