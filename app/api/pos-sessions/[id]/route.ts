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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();

  const { data: session, error } = await sb
    .from('pos_sessions').select('*').eq('id', id).single();
  if (error || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const { data: orders } = await sb
    .from('orders').select('total, status, payment_method').eq('session_id', id);

  const revenue = (orders ?? []).filter(
    (o: Record<string, unknown>) => !['deleted', 'cancelled', 'refunded'].includes(o.status as string)
  );
  const totalRevenue = revenue.reduce((s: number, o: Record<string, unknown>) => s + Number(o.total || 0), 0);
  const cashRevenue  = revenue
    .filter((o: Record<string, unknown>) => (o.payment_method as string)?.includes('cash'))
    .reduce((s: number, o: Record<string, unknown>) => s + Number(o.total || 0), 0);
  const openingFloat = Number((session as Record<string, unknown>).opening_float) || 0;

  return NextResponse.json({
    ...mapSession(session as Record<string, unknown>),
    totalOrders:  orders?.length ?? 0,
    totalRevenue,
    cashRevenue,
    expectedCash: openingFloat + cashRevenue,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sb   = getSupabaseAdmin();

  const { data: orders } = await sb
    .from('orders').select('total, status, payment_method').eq('session_id', id);

  const { data: session } = await sb
    .from('pos_sessions').select('opening_float').eq('id', id).single();

  const openingFloat = Number((session as Record<string, unknown>)?.opening_float) || 0;
  const cashRevenue  = (orders ?? [])
    .filter((o: Record<string, unknown>) =>
      (o.payment_method as string)?.includes('cash') &&
      !['deleted', 'cancelled', 'refunded'].includes(o.status as string)
    )
    .reduce((s: number, o: Record<string, unknown>) => s + Number(o.total || 0), 0);

  const expectedCash = openingFloat + cashRevenue;
  const counted      = Number(body.closingCounted) || 0;
  const discrepancy  = counted - expectedCash;

  const { data, error } = await sb
    .from('pos_sessions')
    .update({
      status:          'closed',
      closed_at:       new Date().toISOString(),
      closing_counted: counted,
      expected_cash:   expectedCash,
      discrepancy,
      notes:           body.notes ?? null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  return NextResponse.json({
    ...mapSession(data as Record<string, unknown>),
    totalOrders: orders?.length ?? 0,
    cashRevenue,
    expectedCash,
    discrepancy,
  });
}
