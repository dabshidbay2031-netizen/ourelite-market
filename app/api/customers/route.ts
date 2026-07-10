import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff, requireSupplierAccess } from '@/lib/apiAuth';
import { errMsg, isMissingColumnError } from '@/lib/apiHelpers';

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
 * GET /api/customers?supplierId=X — a business's OWN customer book.
 * Customers belong to one business (customers.supplier_id, v3.7). Legacy
 * rows with no supplier_id stay visible to everyone until claimed/edited.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supplierParam = searchParams.get('supplierId');

  try {
    const sb = getSupabaseAdmin();
    if (supplierParam !== null) {
      const supplierId = parseInt(supplierParam, 10);
      if (Number.isNaN(supplierId)) {
        return NextResponse.json({ error: 'supplierId must be a number' }, { status: 400 });
      }
      const denied = await requireSupplierAccess(req, supplierId);
      if (denied) return denied;
      const { data, error } = await sb
        .from('customers')
        .select('*')
        .or(`supplier_id.eq.${supplierId},supplier_id.is.null`)
        .order('id', { ascending: false });
      if (error) {
        // Pre-v3.7 schema without the column — every business shares the book
        if (!isMissingColumnError(error)) throw error;
        const { data: all, error: e2 } = await sb
          .from('customers').select('*').order('id', { ascending: false });
        if (e2) throw e2;
        return NextResponse.json((all ?? []).map(map));
      }
      return NextResponse.json((data ?? []).map(map));
    }

    { const denied = await requireStaff(req); if (denied) return denied; }
    const { data, error } = await sb
      .from('customers')
      .select('*')
      .order('id', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data.map(map));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const body = await req.json();
  const { name, phone, email, address, notes, supplierId } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  try {
    const payload: Record<string, unknown> = {
      name:    name.trim(),
      phone:   phone?.trim()   ?? '',
      email:   email?.trim()   ?? '',
      address: address?.trim() ?? '',
      notes:   notes?.trim()   ?? '',
    };
    if (Number.isInteger(Number(supplierId)) && Number(supplierId) > 0) {
      payload.supplier_id = Number(supplierId);
    }
    let { data, error } = await getSupabaseAdmin()
      .from('customers').insert(payload).select().single();
    if (error && payload.supplier_id != null && isMissingColumnError(error)) {
      delete payload.supplier_id;
      ({ data, error } = await getSupabaseAdmin()
        .from('customers').insert(payload).select().single());
    }
    if (error) throw error;
    return NextResponse.json(map(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
