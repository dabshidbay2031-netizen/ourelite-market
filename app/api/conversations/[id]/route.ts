import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg } from '@/lib/apiHelpers';
import type { ChatUser } from '@/lib/types';

/** Resolve a user ID to ChatUser — checks suppliers first, then profiles */
async function resolveChatUser(uid: string): Promise<ChatUser> {
  // Try supplier (business)
  try {
    const { data } = await getSupabaseAdmin()
      .from('suppliers')
      .select('id,name,icon,verified,bio,location,categories,contact_numbers')
      .eq('auth_user_id', uid)
      .maybeSingle();
    if (data) {
      return {
        id:             uid,
        name:           String(data.name),
        avatar:         String(data.icon ?? '🏭'),
        type:           'business',
        verified:       Boolean(data.verified),
        bio:            String(data.bio ?? ''),
        location:       String(data.location ?? ''),
        categories:     (data.categories as string[]) ?? [],
        contactNumbers: (data.contact_numbers as string[]) ?? [],
      };
    }
  } catch { /* ignore */ }

  // Try profile (user)
  try {
    const { data } = await getSupabaseAdmin()
      .from('profiles')
      .select('id,full_name,avatar,verified,phone')
      .eq('id', uid)
      .maybeSingle();
    if (data) {
      return {
        id:       uid,
        name:     String(data.full_name || 'User'),
        avatar:   String(data.avatar ?? '👤'),
        type:     'user',
        verified: Boolean((data as Record<string, unknown>).verified ?? false),
      };
    }
  } catch { /* ignore */ }

  // Fallback
  return { id: uid, name: 'Unknown', avatar: '👤', type: 'user', verified: false };
}

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

// Export resolveChatUser for use in other routes
export { resolveChatUser };
