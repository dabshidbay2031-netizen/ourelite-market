import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SUPPLIERS } from '@/lib/seed-data';
import { errMsg } from '@/lib/apiHelpers';

function mapSupplier(s: Record<string, unknown>) {
  return {
    id: s.id,
    name: s.name,
    rating: s.rating,
    reviews: s.reviews,
    location: s.location,
    minOrder: s.min_order,
    categories: s.categories ?? [],
    icon: s.icon,
    description: s.description,
    productIds: s.product_ids ?? [],
    discount: s.discount,
    deliveryDays: s.delivery_days,
    verified: s.verified,
    badge: s.badge,
    bio: s.bio ?? '',
    contactNumbers: (s.contact_numbers as string[]) ?? [],
    authUserId: s.auth_user_id ?? null,
    hideStock: Boolean(s.hide_stock ?? false),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('suppliers').select('*').eq('id', id).single();
    if (error) throw error;
    return NextResponse.json(mapSupplier(data));
  } catch {
    const s = SUPPLIERS.find(x => x.id === id);
    if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(s);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name          !== undefined) updates.name          = body.name;
  if (body.bio           !== undefined) updates.bio           = body.bio;
  if (body.contactNumbers!== undefined) updates.contact_numbers = body.contactNumbers.slice(0, 4);
  if (body.location      !== undefined) updates.location      = body.location;
  if (body.minOrder      !== undefined) updates.min_order     = parseInt(body.minOrder, 10);
  if (body.categories    !== undefined) updates.categories    = body.categories;
  if (body.icon          !== undefined) updates.icon          = body.icon;
  if (body.description   !== undefined) updates.description   = body.description;
  if (body.discount      !== undefined) updates.discount      = parseInt(body.discount, 10);
  if (body.deliveryDays  !== undefined) updates.delivery_days = body.deliveryDays;
  if (body.verified      !== undefined) updates.verified      = body.verified;
  if (body.badge         !== undefined) updates.badge         = body.badge;
  if (body.slug          !== undefined) updates.slug          = body.slug ?? null;
  if (body.hideStock     !== undefined) updates.hide_stock    = Boolean(body.hideStock);

  const { data, error } = await getSupabaseAdmin()
    .from('suppliers').update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapSupplier(data));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { error } = await getSupabaseAdmin().from('suppliers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
