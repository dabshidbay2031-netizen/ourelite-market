import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireCustomerOwner } from '@/lib/apiAuth';
import { errMsg } from '@/lib/apiHelpers';

function map(c: Record<string, unknown>) {
  return {
    id:         String(c.id),
    name:       c.name      ?? '',
    phone:      c.phone     ?? '',
    email:      c.email     ?? '',
    address:    c.address   ?? '',
    notes:      c.notes     ?? '',
    supplierId: c.supplier_id ?? null,
    createdAt:  c.created_at ?? new Date().toISOString(),
  };
}

/**
 * A customer belongs to exactly one store. Both handlers gate on
 * requireCustomerOwner — requireStaff alone let ANY business account edit or
 * delete ANOTHER business's customer record just by knowing the id (IDOR).
 * The owning store is never taken from the request body.
 */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  { const denied = await requireCustomerOwner(req, id); if (denied) return denied; }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.name    !== undefined) updates.name    = String(body.name).trim();
  if (body.phone   !== undefined) updates.phone   = String(body.phone).trim();
  if (body.email   !== undefined) updates.email   = String(body.email).trim();
  if (body.address !== undefined) updates.address = String(body.address).trim();
  if (body.notes   !== undefined) updates.notes   = String(body.notes).trim();
  // supplier_id is intentionally NOT updatable — a store cannot reassign a
  // customer to (or steal one from) another store.
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes supplied' }, { status: 400 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('customers').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json(map(data as Record<string, unknown>));
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  { const denied = await requireCustomerOwner(req, id); if (denied) return denied; }

  try {
    const { error } = await getSupabaseAdmin().from('customers').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
