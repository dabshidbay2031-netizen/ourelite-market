import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAuthUser, ownsStoreOrAdmin } from '@/lib/apiAuth';
import { errMsg, isMissingColumnError, isMissingTableError } from '@/lib/apiHelpers';
import { initiateSifaloPayment } from '@/lib/payments/sifalo';
import {
  deriveSubscription, planForAccountType, SUBSCRIPTION_PRICES,
  SUBSCRIPTION_CURRENCY, SUBSCRIPTION_TRIAL_DAYS,
} from '@/lib/subscription';
import type { SifaloGateway } from '@/lib/types';

/**
 * Seller subscription billing.
 *
 *   GET   /api/subscriptions?supplierId=X   → current state + receipt history
 *   POST  /api/subscriptions                → pay the access fee (Sifalo charge)
 *   PATCH /api/subscriptions                → request a refund (7-day window only)
 *
 * The fee is decided SERVER-SIDE from the store's account_type — the client can
 * never choose its own price. Every route is gated to the store owner (or an
 * admin). Needs supabase/migration_subscriptions.sql.
 */

interface SupplierRow {
  id: number;
  account_type: string;
  subscription_paid_at: string | null;
  subscription_refunded_at: string | null;
  subscription_plan: string | null;
  subscription_amount: number | null;
}

const VALID_GATEWAYS: ReadonlySet<string> = new Set<SifaloGateway>(['waafi', 'edahab', 'pbwallet']);

async function guard(req: Request, supplierId: number): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsStoreOrAdmin(user.id, supplierId))) {
    return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
  }
  return null;
}

/** Load the subscription-relevant columns, or a Response describing why not. */
async function loadSupplier(supplierId: number): Promise<{ row: SupplierRow } | { res: Response }> {
  const { data, error } = await getSupabaseAdmin()
    .from('suppliers')
    .select('id, account_type, subscription_paid_at, subscription_refunded_at, subscription_plan, subscription_amount')
    .eq('id', supplierId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) {
      return { res: NextResponse.json({ error: 'Billing not enabled — run migration_subscriptions.sql', needsMigration: true }, { status: 501 }) };
    }
    return { res: NextResponse.json({ error: errMsg(error) }, { status: 500 }) };
  }
  if (!data) return { res: NextResponse.json({ error: 'Store not found' }, { status: 404 }) };
  return { row: data as SupplierRow };
}

function stateFrom(row: SupplierRow) {
  return deriveSubscription({
    accountType:            row.account_type,
    subscriptionPaidAt:     row.subscription_paid_at,
    subscriptionRefundedAt: row.subscription_refunded_at,
  });
}

async function receipts(supplierId: number) {
  try {
    const { data } = await getSupabaseAdmin()
      .from('subscription_events')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false });
    return (data ?? []).map(e => ({
      id:        e.id,
      kind:      e.kind,
      amount:    Number(e.amount),
      plan:      e.plan ?? null,
      method:    e.method ?? null,
      createdAt: e.created_at,
    }));
  } catch { return []; }
}

/** GET — the store's subscription state + receipt history. */
export async function GET(req: Request) {
  const supplierId = parseInt(new URL(req.url).searchParams.get('supplierId') ?? '', 10);
  if (Number.isNaN(supplierId)) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });

  const denied = await guard(req, supplierId);
  if (denied) return denied;

  const loaded = await loadSupplier(supplierId);
  if ('res' in loaded) return loaded.res;

  return NextResponse.json({ ...stateFrom(loaded.row), events: await receipts(supplierId) });
}

/**
 * POST — pay the access fee.
 * Body: { supplierId, account, gateway }  (account = payer wallet number)
 * Amount is derived from account_type; the client's amount is ignored.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supplierId = parseInt(String(body.supplierId ?? ''), 10);
  if (Number.isNaN(supplierId)) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });

  const denied = await guard(req, supplierId);
  if (denied) return denied;

  const loaded = await loadSupplier(supplierId);
  if ('res' in loaded) return loaded.res;
  const row = loaded.row;

  const plan = planForAccountType(row.account_type);
  if (!plan) {
    return NextResponse.json({ error: 'This account type has no subscription fee.' }, { status: 400 });
  }

  // Already active (paid and not refunded) → nothing to charge.
  const current = stateFrom(row);
  if (!current.locked) {
    return NextResponse.json({ error: 'Subscription is already active.', ...current }, { status: 409 });
  }

  const amount  = SUBSCRIPTION_PRICES[plan];       // server-decided price
  const account = String(body.account ?? '').trim();
  const gateway = String(body.gateway ?? 'waafi');
  if (!account)                    return NextResponse.json({ error: 'Enter the wallet number to charge.' }, { status: 400 });
  if (!VALID_GATEWAYS.has(gateway)) return NextResponse.json({ error: 'Choose a valid payment method.' }, { status: 400 });

  // Charge via Sifalo (mock until live credentials are configured).
  const pay = await initiateSifaloPayment({
    account, gateway: gateway as SifaloGateway, amount,
    orderId: `SUB-${supplierId}-${Date.now()}`,
  });
  if (pay.status !== 'success') {
    return NextResponse.json(
      { error: pay.message || 'Payment was not approved. Please try again.', paymentStatus: pay.status },
      { status: 402 });
  }

  const sb = getSupabaseAdmin();
  const paidAt = new Date().toISOString();
  const { error: upErr } = await sb.from('suppliers').update({
    subscription_paid_at:     paidAt,
    subscription_refunded_at: null,          // clear any prior refund
    subscription_plan:        plan,
    subscription_amount:      amount,
    subscription_sid:         pay.sid,
  }).eq('id', supplierId);
  if (upErr) return NextResponse.json({ error: errMsg(upErr) }, { status: 500 });

  try {
    await sb.from('subscription_events').insert({
      supplier_id: supplierId, kind: 'payment', amount, plan,
      method: gateway, sid: pay.sid, note: pay.mock ? 'mock charge' : null,
    });
  } catch { /* ledger is best-effort */ }

  const state = stateFrom({ ...row, subscription_paid_at: paidAt, subscription_refunded_at: null });
  return NextResponse.json({ success: true, mock: pay.mock, ...state, events: await receipts(supplierId) }, { status: 201 });
}

/**
 * PATCH — request a refund. Allowed ONLY inside the 7-day money-back window.
 * Body: { supplierId, action: 'refund' }
 */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supplierId = parseInt(String(body.supplierId ?? ''), 10);
  if (Number.isNaN(supplierId)) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });
  if (body.action !== 'refund')  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });

  const denied = await guard(req, supplierId);
  if (denied) return denied;

  const loaded = await loadSupplier(supplierId);
  if ('res' in loaded) return loaded.res;
  const row = loaded.row;

  const state = stateFrom(row);
  if (!state.refundable) {
    const reason = state.status === 'active'
      ? `The ${SUBSCRIPTION_TRIAL_DAYS}-day money-back window has passed — this subscription is no longer refundable.`
      : 'There is no refundable payment on this account.';
    return NextResponse.json({ error: reason, ...state }, { status: 409 });
  }

  const sb = getSupabaseAdmin();
  const refundedAt = new Date().toISOString();
  const { error: upErr } = await sb.from('suppliers')
    .update({ subscription_refunded_at: refundedAt })
    .eq('id', supplierId);
  if (upErr) return NextResponse.json({ error: errMsg(upErr) }, { status: 500 });

  try {
    await sb.from('subscription_events').insert({
      supplier_id: supplierId, kind: 'refund',
      amount: row.subscription_amount ?? SUBSCRIPTION_PRICES[state.plan ?? 'business'],
      plan: row.subscription_plan ?? state.plan, method: 'refund',
      note: `Refunded within ${SUBSCRIPTION_TRIAL_DAYS}-day guarantee`,
    });
  } catch { /* best-effort */ }

  const after = stateFrom({ ...row, subscription_refunded_at: refundedAt });
  return NextResponse.json({ success: true, currency: SUBSCRIPTION_CURRENCY, ...after, events: await receipts(supplierId) });
}
