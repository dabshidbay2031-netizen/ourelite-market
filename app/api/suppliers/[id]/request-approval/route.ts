import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingColumnError } from '@/lib/apiHelpers';

/**
 * POST /api/suppliers/[id]/request-approval
 *
 * User-side transition of the trial lifecycle: trial/expired → pending.
 * Only this transition is possible here — approving is an admin action
 * (PATCH /api/suppliers/[id] with { approvalStatus: 'approved' }).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  try {
    const { data: existing, error: readErr } = await sb
      .from('suppliers').select('*').eq('id', id).single();
    if (readErr || !existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const status = (existing.approval_status as string | null) ?? null;
    if (status === 'approved') {
      return NextResponse.json({ error: 'Account is already approved' }, { status: 409 });
    }
    if (status === 'pending') {
      return NextResponse.json({ error: 'Approval already requested' }, { status: 409 });
    }

    const { data, error } = await sb
      .from('suppliers')
      .update({ approval_status: 'pending', approval_requested_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({
      id:                  data.id,
      approvalStatus:      data.approval_status,
      approvalRequestedAt: data.approval_requested_at,
    });
  } catch (e) {
    if (isMissingColumnError(e)) {
      // Pre-migration schema: the trial feature is off, nothing to request
      return NextResponse.json(
        { error: 'Approval system not enabled yet (run the trial migration)' },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
