import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, jsonWithEtag } from '@/lib/apiHelpers';

export async function GET(req: Request) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = data.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      time: n.time_ago,
      read: n.read,
      icon: n.icon,
    }));

    return jsonWithEtag(req, mapped);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { type = 'info', title, message, icon = '🔔' } = body;
  if (!title || !message) return NextResponse.json({ error: 'title and message required' }, { status: 400 });

  // Compute next ID to fix broken SERIAL sequence
  const { data: maxRow } = await getSupabaseAdmin()
    .from('notifications').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  const nextId = ((maxRow?.id as number) ?? 0) + 1;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('notifications')
      .insert({ id: nextId, type, title, message, time_ago: 'Just now', read: false, icon })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, type: data.type, title: data.title, message: data.message, time: data.time_ago, read: data.read, icon: data.icon }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { ids, read } = await req.json();

  try {
    const { error } = await getSupabaseAdmin()
      .from('notifications')
      .update({ read })
      .in('id', ids);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
