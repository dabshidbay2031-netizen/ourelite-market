import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg } from '@/lib/apiHelpers';
import { getAuthUser, isAdminUser } from '@/lib/apiAuth';

/**
 * DELETE /api/reviews/[id] — remove a review.
 * Only the review's AUTHOR or an admin may delete it. Previously this had NO
 * auth at all, so anyone (even anonymous) could delete anyone's reviews
 * (review vandalism / competitor sabotage).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = parseInt((await params).id, 10);

  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data: review } = await sb.from('reviews').select('user_id').eq('id', id).maybeSingle();
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (String(review.user_id) !== user.id && !(await isAdminUser(user.id))) {
    return NextResponse.json({ error: 'Forbidden — not your review' }, { status: 403 });
  }

  const { error } = await sb.from('reviews').delete().eq('id', id);
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json({ success: true });
}
