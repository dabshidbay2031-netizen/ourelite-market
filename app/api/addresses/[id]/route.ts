import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg } from '@/lib/apiHelpers';
import { getAuthUser } from '@/lib/apiAuth';

/** Confirm the address row belongs to the caller. Returns a Response on failure. */
async function requireOwnAddress(req: Request, id: number): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await getSupabaseAdmin()
    .from('addresses').select('user_id').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (String(data.user_id) !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  { const denied = await requireOwnAddress(req, id); if (denied) return denied; }
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.label     !== undefined) updates.label     = body.label;
  if (body.latitude  !== undefined) updates.latitude  = parseFloat(body.latitude);
  if (body.longitude !== undefined) updates.longitude = parseFloat(body.longitude);
  if (body.notes     !== undefined) updates.notes     = body.notes;

  const { data, error } = await getSupabaseAdmin()
    .from('addresses').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  { const denied = await requireOwnAddress(req, id); if (denied) return denied; }
  const { error } = await getSupabaseAdmin().from('addresses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json({ success: true });
}
