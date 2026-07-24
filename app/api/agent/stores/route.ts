import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingColumnError } from '@/lib/apiHelpers';
import { getAuthUser, agentSupplierIdFor, isAdminUser } from '@/lib/apiAuth';

/**
 * GET /api/agent/stores?agentId=X
 *
 * Every store this field agent has registered, with its review status and
 * bounty state — the data behind the agent's "My stores / earnings" dashboard.
 * Readable only by that agent (or an admin).
 *
 * `storePaying` reflects an active, non-refunded subscription: the agent is only
 * owed a bounty for stores that are actually paying (per the agreed model).
 */
export interface AgentStoreRow {
  id:            number;
  name:          string;
  icon:          string;
  slug:          string | null;
  approvalStatus: string | null;
  submittedAt:   string | null;
  bountyAmount:  number | null;
  bountyPaidAt:  string | null;
  storePaying:   boolean;
  createdAt:     string | null;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('agentId');
  const agentId = parseInt(raw ?? '', 10);
  if (Number.isNaN(agentId)) return NextResponse.json({ error: 'agentId required' }, { status: 400 });

  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const mine = await agentSupplierIdFor(user.id);
  if (mine !== agentId && !(await isAdminUser(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  try {
    const { data, error } = await sb
      .from('suppliers')
      .select('id, name, icon, slug, approval_status, agent_submitted_at, agent_bounty_amount, agent_bounty_paid_at, subscription_paid_at, subscription_refunded_at, created_at')
      .eq('registered_by_agent_id', agentId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const stores: AgentStoreRow[] = (data ?? []).map(s => ({
      id:             s.id as number,
      name:           (s.name as string) ?? '',
      icon:           (s.icon as string) ?? '🏪',
      slug:           (s.slug as string | null) ?? null,
      approvalStatus: (s.approval_status as string | null) ?? null,
      submittedAt:    (s.agent_submitted_at as string | null) ?? null,
      bountyAmount:   s.agent_bounty_amount != null ? Number(s.agent_bounty_amount) : null,
      bountyPaidAt:   (s.agent_bounty_paid_at as string | null) ?? null,
      storePaying:    s.subscription_paid_at != null && s.subscription_refunded_at == null,
      createdAt:      (s.created_at as string | null) ?? null,
    }));

    // Earnings summary for the dashboard header.
    const paid    = stores.filter(s => s.bountyPaidAt).reduce((sum, s) => sum + (s.bountyAmount ?? 0), 0);
    const pending = stores
      .filter(s => !s.bountyPaidAt && s.approvalStatus === 'approved')
      .reduce((sum, s) => sum + (s.bountyAmount ?? 0), 0);

    return NextResponse.json({
      stores,
      totals: {
        registered: stores.length,
        approved:   stores.filter(s => s.approvalStatus === 'approved').length,
        pending:    stores.filter(s => s.approvalStatus === 'pending').length,
        paidEarnings:    Math.round(paid * 100) / 100,
        pendingEarnings: Math.round(pending * 100) / 100,
      },
    });
  } catch (e) {
    if (isMissingColumnError(e)) {
      return NextResponse.json({ stores: [], totals: { registered: 0, approved: 0, pending: 0, paidEarnings: 0, pendingEarnings: 0 }, needsMigration: true });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
