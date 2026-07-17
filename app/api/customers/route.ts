import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAuthUser, isAdminUser, ownsStoreOrAdmin, ownedStoreId, requireAdmin } from '@/lib/apiAuth';
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
 * A store's customer book is PRIVATE to that store.
 *
 * GET /api/customers?supplierId=X — only that store's own customers.
 * GET /api/customers               — admin only (platform-wide list).
 *
 * Customers are strictly scoped by customers.supplier_id. Rows with no owner
 * (legacy, pre-v3.7) are deliberately NOT shared: they are visible to admins
 * only. Previously the query was `supplier_id.eq.X OR supplier_id.is.null`,
 * which showed every unowned customer to EVERY business, and the unscoped
 * branch let any store dump the whole platform's customer book.
 */
export async function GET(req: Request) {
  const supplierParam = new URL(req.url).searchParams.get('supplierId');

  // ── Platform-wide list: admins only ──────────────────────────
  if (supplierParam === null) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    try {
      const { data, error } = await getSupabaseAdmin()
        .from('customers').select('*').order('id', { ascending: false });
      if (error) throw error;
      return NextResponse.json((data ?? []).map(map));
    } catch (e) {
      return NextResponse.json({ error: errMsg(e) }, { status: 500 });
    }
  }

  // ── One store's own book ─────────────────────────────────────
  const supplierId = parseInt(supplierParam, 10);
  if (Number.isNaN(supplierId)) {
    return NextResponse.json({ error: 'supplierId must be a number' }, { status: 400 });
  }
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  if (!(await ownsStoreOrAdmin(user.id, supplierId))) {
    return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('customers')
      .select('*')
      .eq('supplier_id', supplierId)      // strict — no unowned rows leak in
      .order('id', { ascending: false });
    if (error) throw error;
    return NextResponse.json((data ?? []).map(map));
  } catch (e) {
    // Fail closed: never fall back to returning every store's customers.
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/**
 * POST /api/customers — add a customer to the CALLER'S OWN book.
 *
 * The owning store is resolved from the caller's account, not from the request
 * body, so a store can neither plant a customer in a competitor's book nor
 * create an unowned row that everyone can see. Admins may pass an explicit
 * supplierId to file a customer on a store's behalf.
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const admin = await isAdminUser(user.id);
  const requested = Number(body.supplierId);
  const hasRequested = Number.isInteger(requested) && requested > 0;

  let supplierId: number | null;
  if (admin) {
    // An admin may file for any store (or leave it unowned).
    supplierId = hasRequested ? requested : null;
  } else {
    supplierId = await ownedStoreId(user.id);
    if (supplierId == null) {
      return NextResponse.json({ error: 'Forbidden — store access required' }, { status: 403 });
    }
    // A body supplierId is only honoured when it IS the caller's own store.
    if (hasRequested && requested !== supplierId) {
      return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
    }
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('customers')
      .insert({
        name,
        phone:   typeof body.phone   === 'string' ? body.phone.trim()   : '',
        email:   typeof body.email   === 'string' ? body.email.trim()   : '',
        address: typeof body.address === 'string' ? body.address.trim() : '',
        notes:   typeof body.notes   === 'string' ? body.notes.trim()   : '',
        supplier_id: supplierId,
      })
      .select().single();
    if (error) throw error;
    return NextResponse.json(map(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
