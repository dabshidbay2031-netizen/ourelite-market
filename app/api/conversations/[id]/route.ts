import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg } from '@/lib/apiHelpers';
import { resolveChatUser } from '@/lib/chatHelpers';

/**
 * GET /api/conversations/[id]?viewerId=X
 * Returns conversation details with both participants' profiles resolved.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const viewerId = searchParams.get('viewerId') ?? '';

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('conversations')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const otherUserId = data.user_id_1 === viewerId ? data.user_id_2 : data.user_id_1;
    const [viewer, other] = await Promise.all([
      resolveChatUser(viewerId || data.user_id_1),
      resolveChatUser(otherUserId),
    ]);

    return NextResponse.json({
      id:        data.id,
      userId1:   data.user_id_1,
      userId2:   data.user_id_2,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      viewer,
      otherUser: other,
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
