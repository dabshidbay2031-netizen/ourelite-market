import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isUUIDError, isMissingColumnError, jsonWithEtag } from '@/lib/apiHelpers';
import { slugify, isValidSlug } from '@/lib/slug';

/**
 * A unique, non-reserved slug derived from the store name — "TechZone!" →
 * "techzone", or "techzone-2" if taken. Returns null when the name can't
 * produce a valid slug (owner can still set one manually in Profile).
 */
async function generateUniqueSlug(name: string): Promise<string | null> {
  const base = slugify(name);
  if (!base || !isValidSlug(base)) return null;
  const { data } = await getSupabaseAdmin()
    .from('suppliers').select('slug').like('slug', `${base}%`);
  const taken = new Set((data ?? []).map(r => r.slug as string));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base.slice(0, 30 - String(i).length - 1)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

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
    slug:           (s.slug as string | null | undefined) ?? null,
    latitude:       (s.latitude  as number | null | undefined) ?? null,
    longitude:      (s.longitude as number | null | undefined) ?? null,
    hideStock:      Boolean(s.hide_stock  ?? false),
    onlineOnly:     Boolean(s.online_only ?? false),
    accountType:    (s.account_type as string) ?? 'business',
    /* Trial/approval — absent columns (pre-migration schema) map to null */
    approvalStatus:      (s.approval_status as string | undefined) ?? null,
    trialStartedAt:      (s.trial_started_at as string | undefined) ?? null,
    approvalRequestedAt: (s.approval_requested_at as string | undefined) ?? null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const authUserId = searchParams.get('authUserId');
  const slug       = searchParams.get('slug');

  // ── Storefront slug lookup (used by the #/:slug hash route) ──
  if (slug) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('suppliers').select('*')
        .eq('slug', slug.toLowerCase()).maybeSingle();
      if (data) return NextResponse.json(mapSupplier(data as Record<string, unknown>));
    } catch { /* table may not have a slug column yet */ }
    return NextResponse.json(null, { status: 404 });
  }

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
    return jsonWithEtag(req, data.map(mapSupplier), headers);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, authUserId, location, icon, description, categories,
          discount, deliveryDays, minOrder, badge, verified, accountType, onlineOnly } = body;

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
    account_type:  (accountType === 'supplier' || accountType === 'business' || accountType === 'agent') ? accountType : 'business',
  };

  // Every new store gets a clean shareable link (<domain>/<slug>) from day one
  const autoSlug = await generateUniqueSlug(String(name));

  // Compute next safe ID to work around a potentially broken SERIAL sequence
  const { data: maxRow } = await getSupabaseAdmin()
    .from('suppliers').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  const nextId = ((maxRow?.id as number) ?? 0) + 1;

  // Phase 1: full insert with auth_user_id and explicit id
  try {
    const newSupplier: Record<string, unknown> = { ...baseFields, id: nextId };
    if (autoSlug)   newSupplier.slug = autoSlug;
    if (authUserId) newSupplier.auth_user_id = authUserId;
    if (onlineOnly) newSupplier.online_only = true;

    let { data, error } = await getSupabaseAdmin()
      .from('suppliers').insert(newSupplier).select().single();
    // Pre-migration schema without a slug / online_only column — retry without them
    if (error && isMissingColumnError(error)) {
      delete newSupplier.slug;
      delete newSupplier.online_only;
      ({ data, error } = await getSupabaseAdmin()
        .from('suppliers').insert(newSupplier).select().single());
    }
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
