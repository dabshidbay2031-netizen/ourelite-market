import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

/**
 * POST /api/wishlist/sync
 * Body: { userId, productIds: number[] }
 * Upserts the full wishlist for a user in one batch.
 */
export async function POST(req: Request) {
  const { userId, productIds } = await req.json();
  if (!userId || !Array.isArray(productIds)) {
    return NextResponse.json({ error: 'userId and productIds required' }, { status: 400 });
  }

  try {
    // Delete existing + re-insert (simplest idempotent batch sync)
    await getSupabaseAdmin().from('wishlists').delete().eq('user_id', userId);
    if (productIds.length > 0) {
      await getSupabaseAdmin().from('wishlists').insert(
        productIds.map(id => ({ user_id: userId, product_id: id }))
      );
    }
    return NextResponse.json({ success: true, count: productIds.length });
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json({ success: true }); // graceful
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
