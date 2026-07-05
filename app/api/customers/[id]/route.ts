import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff } from '@/lib/apiAuth';
import { errMsg } from '@/lib/apiHelpers';

function map(c: Record<string, unknown>) {
  return {
    id:        String(c.id),
    name:      c.name      ?? '',
    phone:     c.phone     ?? '',
    email:     c.email     ?? '',
    address:   c.address   ?? '',
    notes:     c.notes     ?? '',
    createdAt: c.created_at ?? new Date().toISOString(),
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const id   = (await params).id;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name    !== undefined) updates.name    = String(body.name).trim();
  if (body.phone   !== undefined) updates.phone   = String(body.phone).trim();
  if (body.email   !== undefined) updates.email   = String(body.email).trim();
  if (body.address !== undefined) updates.address = String(body.address).trim();
  if (body.notes   !== undefined) updates.notes   = String(body.notes).trim();

  const { data, error } = await getSupabaseAdmin()
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(map(data));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const id = (await params).id;
  const { error } = await getSupabaseAdmin()
    .from('customers')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
