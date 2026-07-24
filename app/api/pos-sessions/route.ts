import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff } from '@/lib/apiAuth';

function mapSession(s: Record<string, unknown>) {
  return {
    id:             s.id,
    openedBy:       s.opened_by,
    cashierName:    s.cashier_name ?? '',
    openedAt:       s.opened_at,
    closedAt:       s.closed_at ?? null,
    openingFloat:   Number(s.opening_float) || 0,
    closingCounted: s.closing_counted != null ? Number(s.closing_counted) : null,
    expectedCash:   s.expected_cash  != null ? Number(s.expected_cash)  : null,
    discrepancy:    s.discrepancy    != null ? Number(s.discrepancy)    : null,
    status:         s.status as 'open' | 'closed',
    notes:          s.notes ?? null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('current') === '1') {
    const { data, error } = await getSupabaseAdmin()
      .from('pos_sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ? mapSession(data as Record<string, unknown>) : null);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('pos_sessions')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(s => mapSession(s as Record<string, unknown>)));
}

export async function POST(req: Request) {
  { const denied = await requireStaff(req, 'pos'); if (denied) return denied; }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const openedBy    = body.openedBy    ? String(body.openedBy)    : null;
  const cashierName = body.cashierName ? String(body.cashierName) : (openedBy ?? 'Cashier');
  const openingFloat = Number(body.openingFloat) || 0;

  if (!openedBy) return NextResponse.json({ error: 'openedBy is required' }, { status: 400 });

  // Close any open sessions for this user first
  await getSupabaseAdmin()
    .from('pos_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('opened_by', openedBy)
    .eq('status', 'open');

  const { data, error } = await getSupabaseAdmin()
    .from('pos_sessions')
    .insert({ opened_by: openedBy, cashier_name: cashierName, opening_float: openingFloat, status: 'open' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapSession(data as Record<string, unknown>), { status: 201 });
}
