import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg } from '@/lib/apiHelpers';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id   = parseInt(params.id, 10);
  const body = await req.json();

  // If setting as default, clear others for this user first
  if (body.isDefault && body.userId) {
    await getSupabaseAdmin()
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', body.userId);
  }

  const updates: Record<string, unknown> = {};
  if (body.label     !== undefined) updates.label      = body.label;
  if (body.fullName  !== undefined) updates.full_name  = body.fullName;
  if (body.street    !== undefined) updates.street     = body.street;
  if (body.city      !== undefined) updates.city       = body.city;
  if (body.country   !== undefined) updates.country    = body.country;
  if (body.phone     !== undefined) updates.phone      = body.phone;
  if (body.isDefault !== undefined) updates.is_default = body.isDefault;

  const { data, error } = await getSupabaseAdmin()
    .from('addresses').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await getSupabaseAdmin()
    .from('addresses').delete().eq('id', parseInt(params.id, 10));
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json({ success: true });
}
