import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

function mapCoupon(c: Record<string, unknown>) {
  return {
    id:         c.id,
    code:       c.code,
    type:       c.type,
    value:      c.value,
    minOrder:   c.min_order,
    maxUses:    c.max_uses ?? null,
    usedCount:  c.used_count,
    expiresAt:  c.expires_at ?? null,
    supplierId: c.supplier_id ?? null,
    active:     c.active,
    createdAt:  c.created_at,
  };
}

/** GET /api/coupons?supplierId=X  or  /api/coupons (all) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplierId');

  try {
    let q = getSupabaseAdmin().from('coupons').select('*').order('created_at', { ascending: false });
    if (supplierId) q = q.eq('supplier_id', parseInt(supplierId, 10));
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data.map(mapCoupon));
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/coupons — create a coupon */
export async function POST(req: Request) {
  const body = await req.json();
  const { code, type = 'percent', value, minOrder = 0, maxUses, expiresAt, supplierId } = body;
  if (!code || !value) return NextResponse.json({ error: 'code and value required' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('coupons')
      .insert({
        code:        String(code).toUpperCase().trim(),
        type,
        value:       parseFloat(String(value)),
        min_order:   parseFloat(String(minOrder)),
        max_uses:    maxUses ? parseInt(String(maxUses), 10) : null,
        expires_at:  expiresAt ?? null,
        supplier_id: supplierId ? parseInt(String(supplierId), 10) : null,
        active:      true,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(mapCoupon(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: 'coupons table missing — run schema_all.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
