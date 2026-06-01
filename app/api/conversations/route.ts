import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

/* ── helpers ─────────────────────────────────────── */
function mapConv(c: Record<string, unknown>) {
  return {
    id:        c.id,
    userId1:   c.user_id_1,
    userId2:   c.user_id_2,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

/**
 * GET /api/conversations?userId=X
 * Returns all conversations involving this user, ordered newest first.
 * Includes the last message and unread count for each.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('conversations')
      .select('*')
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Enrich each conversation with last message + unread count
    const enriched = await Promise.all(
      (data ?? []).map(async (conv) => {
        const otherUserId = conv.user_id_1 === userId ? conv.user_id_2 : conv.user_id_1;

        // Last message
        const { data: msgs } = await getSupabaseAdmin()
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);
        const lastMsg = msgs?.[0] ?? null;

        // Unread count
        const { count } = await getSupabaseAdmin()
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)
          .is('read_at', null);

        return {
          ...mapConv(conv),
          otherUserId,
          lastMessage: lastMsg ? {
            id:          lastMsg.id,
            content:     lastMsg.content,
            imageUrl:    lastMsg.image_url,
            messageType: lastMsg.message_type,
            senderId:    lastMsg.sender_id,
            createdAt:   lastMsg.created_at,
          } : null,
          unreadCount: count ?? 0,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/**
 * POST /api/conversations
 * Find existing conversation between two users, or create one.
 * Body: { userId1, userId2 }
 */
export async function POST(req: Request) {
  const { userId1, userId2 } = await req.json();
  if (!userId1 || !userId2) {
    return NextResponse.json({ error: 'userId1 and userId2 required' }, { status: 400 });
  }
  if (userId1 === userId2) {
    return NextResponse.json({ error: 'Cannot chat with yourself' }, { status: 400 });
  }

  // Normalize: always store smaller id first to ensure uniqueness
  const [u1, u2] = [userId1, userId2].sort();

  try {
    // Try to find existing
    const { data: existing } = await getSupabaseAdmin()
      .from('conversations')
      .select('*')
      .eq('user_id_1', u1)
      .eq('user_id_2', u2)
      .maybeSingle();

    if (existing) return NextResponse.json(mapConv(existing));

    // Create new
    const { data, error } = await getSupabaseAdmin()
      .from('conversations')
      .insert({ user_id_1: u1, user_id_2: u2 })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(mapConv(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({
        error: 'Chat tables missing. Run supabase/migration.sql.',
        needsMigration: true,
      }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
