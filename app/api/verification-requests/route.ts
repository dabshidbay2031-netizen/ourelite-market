import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

/** GET /api/verification-requests?supplierId=X  or all */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplierId');

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

/** POST /api/verification-requests — supplier submits a request */
export async function POST(req: Request) {
  const { supplierId } = await req.json();
  if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });

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

/** PATCH /api/verification-requests?supplierId=X — admin approves/rejects */
export async function PATCH(req: Request) {
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
