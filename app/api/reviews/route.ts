import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError, isMissingColumnError } from '@/lib/apiHelpers';
import { requireUser } from '@/lib/apiAuth';

function mapReview(r: Record<string, unknown>) {
  return {
    id:         r.id,
    productId:  r.product_id,
    userId:     r.user_id,
    rating:     r.rating,
    comment:    r.comment   ?? null,
    userName:   r.user_name ?? 'Anonymous',
    userAvatar: r.user_avatar ?? '👤',
    supplierId: r.supplier_id ?? null,
    createdAt:  r.created_at,
  };
}

/**
 * Roll this store's attributed reviews up into suppliers.rating/reviews so
 * the storefront profile reflects what customers actually rated. Only the
 * store the review was WRITTEN AGAINST (the seller — a claimed product
 * credits the claiming store, not the wholesaler) receives it.
 */
async function updateStoreRating(supplierId: number) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('reviews').select('rating').eq('supplier_id', supplierId);
  if (error || !data || data.length === 0) return;
  const avg = data.reduce((s, r) => s + (r.rating as number), 0) / data.length;
  await sb.from('suppliers')
    .update({ rating: Math.round(avg * 10) / 10, reviews: data.length })
    .eq('id', supplierId);
}

/** GET /api/reviews?productId=X */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('reviews')
      .select('*')
      .eq('product_id', parseInt(productId, 10))
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data.map(mapReview));
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/reviews */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { productId, rating, comment, userName, userAvatar } = body;
  const userId = auth; // authoritative: reviewer is the authenticated caller (no impersonation)
  if (!productId || !rating) {
    return NextResponse.json({ error: 'productId and rating required' }, { status: 400 });
  }
  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be 1–5' }, { status: 400 });
  }
  // The store this review credits: the storefront it was written from
  // (claimed products credit the claiming store), falling back to the
  // catalog owner when the product page had no store context.
  let supplierId = Number.isInteger(Number(body.supplierId)) && Number(body.supplierId) > 0
    ? Number(body.supplierId) : null;
  if (supplierId == null) {
    try {
      const { data: p } = await getSupabaseAdmin()
        .from('products').select('supplier_id').eq('id', parseInt(String(productId), 10)).maybeSingle();
      supplierId = (p?.supplier_id as number | null) ?? null;
    } catch { /* attribution is best-effort */ }
  }

  try {
    const payload: Record<string, unknown> = {
      product_id:  parseInt(String(productId), 10),
      user_id:     String(userId),
      rating:      parseInt(String(rating), 10),
      comment:     comment?.trim() ?? null,
      user_name:   userName  ?? 'Anonymous',
      user_avatar: userAvatar ?? '👤',
    };
    if (supplierId != null) payload.supplier_id = supplierId;

    let { data, error } = await getSupabaseAdmin()
      .from('reviews')
      .upsert(payload, { onConflict: 'product_id,user_id' })
      .select()
      .single();
    if (error && supplierId != null && isMissingColumnError(error)) {
      // Pre-v3.7 schema without reviews.supplier_id — save without attribution
      delete payload.supplier_id;
      ({ data, error } = await getSupabaseAdmin()
        .from('reviews')
        .upsert(payload, { onConflict: 'product_id,user_id' })
        .select()
        .single());
    }
    if (error) throw error;

    // Update product average rating
    const { data: allRatings } = await getSupabaseAdmin()
      .from('reviews')
      .select('rating')
      .eq('product_id', parseInt(String(productId), 10));
    if (allRatings && allRatings.length > 0) {
      const avg = allRatings.reduce((s, r) => s + (r.rating as number), 0) / allRatings.length;
      await getSupabaseAdmin()
        .from('products')
        .update({ rating: Math.round(avg * 10) / 10, reviews: allRatings.length })
        .eq('id', parseInt(String(productId), 10));
    }

    // Update the credited store's profile rating (best-effort)
    if (supplierId != null) {
      try { await updateStoreRating(supplierId); } catch { /* ignore */ }
    }

    return NextResponse.json(mapReview(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: 'reviews table missing — run schema_all.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
