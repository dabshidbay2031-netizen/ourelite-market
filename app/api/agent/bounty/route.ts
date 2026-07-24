import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingColumnError } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/apiAuth';

/**
 * PATCH /api/agent/bounty  { storeId, amount?, paid? }
 *
 * Admin-only. Records what the agent who registered a store is owed and whether
 * it's been paid. Payment is a manual action outside the app (the admin sends the
 * money, then flips `paid`), so this just persists the amount + paid timestamp:
 *   • amount        → sets agent_bounty_amount
 *   • paid === true  → stamps agent_bounty_paid_at = now
 *   • paid === false → clears agent_bounty_paid_at
 */
export async function PATCH(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const storeId = parseInt(String(body.storeId ?? ''), 10);
  if (Number.isNaN(storeId)) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
    if (!(amount >= 0)) return NextResponse.json({ error: 'amount must be 0 or more' }, { status: 400 });
    update.agent_bounty_amount = amount;
  }
  if (typeof body.paid === 'boolean') {
    update.agent_bounty_paid_at = body.paid ? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update (send amount and/or paid)' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  try {
    const { data, error } = await sb
      .from('suppliers')
      .update(update)
      .eq('id', storeId)
      .select('id, agent_bounty_amount, agent_bounty_paid_at')
      .single();
    if (error) throw error;
    return NextResponse.json({
      success:      true,
      id:           data.id,
      bountyAmount: data.agent_bounty_amount != null ? Number(data.agent_bounty_amount) : null,
      bountyPaidAt: data.agent_bounty_paid_at ?? null,
    });
  } catch (e) {
    if (isMissingColumnError(e)) {
      return NextResponse.json(
        { error: 'Agent registration not enabled yet (run migration_v3_9.sql)', needsMigration: true },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
