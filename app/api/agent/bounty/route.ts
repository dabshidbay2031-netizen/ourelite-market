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
    // Guard: an agent is only owed a bounty for a store that's actually paying.
    // The admin UI disables "Mark paid" for non-paying stores, but enforce it
    // server-side too so the rule can't be bypassed. (Clearing paid is fine.)
    if (body.paid === true) {
      const { data: store, error: sErr } = await sb
        .from('suppliers')
        .select('subscription_paid_at, subscription_refunded_at, approval_status')
        .eq('id', storeId)
        .single();
      if (sErr) throw sErr;
      const paying = store.subscription_paid_at != null && store.subscription_refunded_at == null;
      if (!paying) {
        return NextResponse.json({ error: 'Store isn’t actively paying — can’t mark the bounty paid yet' }, { status: 409 });
      }
      if ((store.approval_status as string) !== 'approved') {
        return NextResponse.json({ error: 'Approve the store before paying the agent' }, { status: 409 });
      }
    }

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
