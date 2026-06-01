import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SUPPLIERS } from '@/lib/seed-data';
import { errMsg, isUUIDError } from '@/lib/apiHelpers';

function mapSupplier(s: Record<string, unknown>) {
  return {
    id:             s.id,
    name:           s.name,
    rating:         s.rating,
    reviews:        s.reviews,
    location:       s.location,
    minOrder:       s.min_order,
    categories:     s.categories   ?? [],
    icon:           s.icon         ?? '🏭',
    description:    s.description  ?? '',
    productIds:     s.product_ids  ?? [],
    discount:       s.discount     ?? 0,
    deliveryDays:   s.delivery_days ?? '3-5',
    verified:       s.verified     ?? false,
    badge:          s.badge        ?? '',
    bio:            s.bio          ?? '',
    contactNumbers: (s.contact_numbers as string[]) ?? [],
    authUserId:     s.auth_user_id  ?? null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const authUserId = searchParams.get('authUserId');

  try {
    let query = getSupabaseAdmin().from('suppliers').select('*');
    if (authUserId) query = query.eq('auth_user_id', authUserId);
    else            query = query.order('id');
    const { data, error } = await query;
    if (error) throw error;
    // Suppliers rarely change — cache for 5 minutes, user-specific are private
    const headers = authUserId
      ? { 'Cache-Control': 'private, no-store' }
      : { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };
    return NextResponse.json(data.map(mapSupplier), { headers });
  } catch {
    if (authUserId) return NextResponse.json([]);
    return NextResponse.json(SUPPLIERS, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, authUserId, location, icon, description, categories,
          discount, deliveryDays, minOrder, badge, verified } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Idempotent: return existing supplier if authUserId already registered
  if (authUserId) {
    const { data: existing } = await getSupabaseAdmin()
      .from('suppliers').select('*').eq('auth_user_id', authUserId).single();
    if (existing) return NextResponse.json(mapSupplier(existing as Record<string, unknown>));
  }

  const baseFields = {
    name:          String(name).trim(),
    rating:        0,
    reviews:       0,
    location:      location?.trim()  ?? '',
    min_order:     parseInt(minOrder ?? '0', 10),
    categories:    Array.isArray(categories) ? categories : [],
    icon:          icon              ?? '🏭',
    description:   description?.trim() ?? '',
    product_ids:   [],
    discount:      parseInt(discount ?? '0', 10),
    delivery_days: deliveryDays       ?? '3-5',
    verified:      verified           ?? false,
    badge:         badge?.trim()      ?? 'New',
    bio:           '',
    contact_numbers: [],
  };

  // Compute next safe ID to work around a potentially broken SERIAL sequence
  const { data: maxRow } = await getSupabaseAdmin()
    .from('suppliers').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  const nextId = ((maxRow?.id as number) ?? 0) + 1;

  // Phase 1: full insert with auth_user_id and explicit id
  try {
    const newSupplier: Record<string, unknown> = { ...baseFields, id: nextId };
    if (authUserId) newSupplier.auth_user_id = authUserId;

    const { data, error } = await getSupabaseAdmin()
      .from('suppliers').insert(newSupplier).select().single();
    if (error) throw error;
    return NextResponse.json(mapSupplier(data as Record<string, unknown>), { status: 201 });
  } catch (e1) {
    // Phase 2: auth_user_id column is still UUID — insert without it
    if (isUUIDError(e1)) {
      try {
        const { data, error } = await getSupabaseAdmin()
          .from('suppliers').insert({ ...baseFields, id: nextId }).select().single();
        if (error) throw error;
        return NextResponse.json(mapSupplier(data as Record<string, unknown>), { status: 201 });
      } catch (e2) {
        return NextResponse.json({ error: errMsg(e2) }, { status: 500 });
      }
    }
    return NextResponse.json({ error: errMsg(e1) }, { status: 500 });
  }
}
