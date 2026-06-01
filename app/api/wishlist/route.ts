import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

/** GET /api/wishlist?userId=X — returns array of product IDs */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('wishlists')
      .select('product_id')
      .eq('user_id', userId);
    if (error) throw error;
    return NextResponse.json(data.map(r => r.product_id as number));
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/wishlist — add product to wishlist */
export async function POST(req: Request) {
  const { userId, productId } = await req.json();
  if (!userId || !productId) return NextResponse.json({ error: 'userId, productId required' }, { status: 400 });

  try {
    await getSupabaseAdmin()
      .from('wishlists')
      .upsert({ user_id: userId, product_id: parseInt(String(productId), 10) },
               { onConflict: 'user_id,product_id' });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json({ success: true }); // graceful
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** DELETE /api/wishlist?userId=X&productId=Y */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId    = searchParams.get('userId');
  const productId = searchParams.get('productId');
  if (!userId || !productId) return NextResponse.json({ error: 'userId, productId required' }, { status: 400 });

  try {
    await getSupabaseAdmin()
      .from('wishlists')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', parseInt(productId, 10));
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json({ success: true });
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
