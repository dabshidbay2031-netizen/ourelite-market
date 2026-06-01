import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

function mapReview(r: Record<string, unknown>) {
  return {
    id:         r.id,
    productId:  r.product_id,
    userId:     r.user_id,
    rating:     r.rating,
    comment:    r.comment   ?? null,
    userName:   r.user_name ?? 'Anonymous',
    userAvatar: r.user_avatar ?? '👤',
    createdAt:  r.created_at,
  };
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
  const body = await req.json();
  const { productId, userId, rating, comment, userName, userAvatar } = body;
  if (!productId || !userId || !rating) {
    return NextResponse.json({ error: 'productId, userId, rating required' }, { status: 400 });
  }
  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be 1–5' }, { status: 400 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('reviews')
      .upsert({
        product_id:  parseInt(String(productId), 10),
        user_id:     String(userId),
        rating:      parseInt(String(rating), 10),
        comment:     comment?.trim() ?? null,
        user_name:   userName  ?? 'Anonymous',
        user_avatar: userAvatar ?? '👤',
      }, { onConflict: 'product_id,user_id' })
      .select()
      .single();
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

    return NextResponse.json(mapReview(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: 'reviews table missing — run schema_all.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
