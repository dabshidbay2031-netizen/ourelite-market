import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff } from '@/lib/apiAuth';
import { hashPassword } from '@/lib/passwordHash';

function mapCashier(c: Record<string, unknown>) {
  return {
    id:          c.id,
    businessId:  c.business_id,
    name:        c.name,
    phone:       c.phone,
    privileges:  c.privileges ?? [],
    isActive:    c.is_active !== false,
    lastLoginAt: c.last_login_at ?? null,
    createdAt:   c.created_at,
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name       !== undefined) updates.name       = String(body.name).trim();
  if (body.phone      !== undefined) updates.phone      = String(body.phone).trim();
  if (body.privileges !== undefined) updates.privileges = Array.isArray(body.privileges) ? body.privileges : [];
  if (body.isActive   !== undefined) updates.is_active  = Boolean(body.isActive);

  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 4) return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
    updates.password_hash = await hashPassword(pw);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('cashiers')
    .update(updates)
    .eq('id', id)
    .select('id, business_id, name, phone, privileges, is_active, last_login_at, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Phone number already in use' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Cashier not found' }, { status: 404 });
  return NextResponse.json(mapCashier(data as Record<string, unknown>));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const { id } = await params;
  const { error } = await getSupabaseAdmin()
    .from('cashiers').update({ is_active: false }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
