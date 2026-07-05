import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';
import { requireAdmin, getAuthUser, ownsStoreOrAdmin, isAdminUser } from '@/lib/apiAuth';

/** GET /api/verification-requests?supplierId=X  (own store or admin) or all (admin) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplierId');

  // Verification requests are store-private (status/admin messages). A store may
  // read its OWN; only an admin may list across all stores.
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (supplierId) {
    if (!(await ownsStoreOrAdmin(user.id, parseInt(supplierId, 10)))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (!(await isAdminUser(user.id))) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  try {
    let q = getSupabaseAdmin()
      .from('verification_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (supplierId) q = q.eq('supplier_id', parseInt(supplierId, 10));
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/verification-requests — a supplier submits a request for ITS OWN store */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supplierId } = await req.json();
  if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });
  // You can only request verification for a store you own.
  if (!(await ownsStoreOrAdmin(user.id, parseInt(String(supplierId), 10)))) {
    return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('verification_requests')
      .upsert({ supplier_id: parseInt(String(supplierId), 10), status: 'pending', reviewed_at: null, message: null },
              { onConflict: 'supplier_id' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: 'verification_requests table missing — run schema_all.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** PATCH /api/verification-requests?supplierId=X — ADMIN ONLY approves/rejects.
 *  (Sets suppliers.verified when approved — must never be self-serve, or any
 *  store could grant itself the "✓ Verified" trust badge.) */
export async function PATCH(req: Request) {
  { const denied = await requireAdmin(req); if (denied) return denied; }

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplierId');
  if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });

  const { status, message } = await req.json();

  const { data, error } = await getSupabaseAdmin()
    .from('verification_requests')
    .update({ status, message: message ?? null, reviewed_at: new Date().toISOString() })
    .eq('supplier_id', parseInt(supplierId, 10))
    .select()
    .single();

  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });

  // If approved, mark the supplier as verified
  if (status === 'approved') {
    await getSupabaseAdmin()
      .from('suppliers')
      .update({ verified: true, badge: 'Verified' })
      .eq('id', parseInt(supplierId, 10));
  }

  return NextResponse.json(data);
}
