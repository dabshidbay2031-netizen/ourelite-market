import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/** PATCH /api/admin/admins/[id] — change role */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id   = parseInt(params.id, 10);
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.role  !== undefined) updates.role  = body.role;
  if (body.name  !== undefined) updates.name  = body.name;
  if (body.email !== undefined) updates.email = body.email;

  const { data, error } = await getSupabaseAdmin()
    .from('admins')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = data as Record<string, unknown>;
  return NextResponse.json({ id: r.id, userId: r.user_id, role: r.role, name: r.name, email: r.email, createdAt: r.created_at });
}

/** DELETE /api/admin/admins/[id] — remove admin */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { error } = await getSupabaseAdmin().from('admins').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
