import { getSupabaseAdmin } from '@/lib/supabase';

export interface NotificationInput {
  /** Recipient. null = a global/broadcast notification shown to everyone. */
  userId:  string | null;
  type:    string;
  title:   string;
  message: string;
  icon?:   string;
}

/**
 * Insert one or more in-app notification rows (best-effort — a failure here
 * must never fail the mutation that triggered it).
 *
 * The notifications table's SERIAL sequence is out of sync in this database, so
 * ids are assigned explicitly from max+1 (same approach as the POST route).
 */
export async function createNotifications(rows: NotificationInput[]): Promise<void> {
  const list = rows.filter(r => r.title && r.message);
  if (!list.length) return;
  try {
    const sb = getSupabaseAdmin();
    const { data: maxRow } = await sb
      .from('notifications')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextId = ((maxRow?.id as number) ?? 0) + 1;
    const payload = list.map(r => ({
      id:       nextId++,
      user_id:  r.userId,
      type:     r.type,
      title:    r.title,
      message:  r.message,
      time_ago: 'Just now',
      read:     false,
      icon:     r.icon ?? '🔔',
    }));

    await sb.from('notifications').insert(payload);
  } catch {
    /* best-effort */
  }
}
