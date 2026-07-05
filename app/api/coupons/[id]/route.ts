import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff } from '@/lib/apiAuth';
import { errMsg } from '@/lib/apiHelpers';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.active    !== undefined) updates.active     = body.active;
  if (body.maxUses   !== undefined) updates.max_uses   = body.maxUses;
  if (body.expiresAt !== undefined) updates.expires_at = body.expiresAt;
  if (body.value     !== undefined) updates.value      = parseFloat(body.value);

  const { data, error } = await getSupabaseAdmin()
    .from('coupons').update(updates).eq('id', parseInt((await params).id, 10)).select().single();
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const { error } = await getSupabaseAdmin()
    .from('coupons').delete().eq('id', parseInt((await params).id, 10));
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json({ success: true });
}
