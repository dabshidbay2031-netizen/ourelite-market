import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError, isMissingColumnError } from '@/lib/apiHelpers';
import { getAuthUser, ownsStoreOrAdmin } from '@/lib/apiAuth';
import { NON_REVENUE_STATUSES } from '@/lib/revenue';

/**
 * Online-payment wallet for a store.
 *
 *  • onlineTotal — this store's share of every SUCCESSFUL online-paid order
 *    (payment_method in ONLINE_METHODS, revenue-counting status). Because our
 *    checkout only places an order after the wallet charge succeeds, a
 *    Sifalo/Waafi order == a confirmed online payment.
 *  • paidOut      — sum of the store's recorded payouts (the `payouts` ledger).
 *  • balance      — onlineTotal − paidOut. Paying out deducts the exact amount.
 *  • payoutNumber — the company phone saved on the supplier; always the number a
 *    payout goes to.
 *
 * The `payouts` table and `suppliers.payout_number` column ship in schema_v3.sql;
 * run supabase/migration_payouts.sql on an existing DB. Until then this degrades:
 * onlineTotal/balance still show, but saving a number or paying out returns
 * needsMigration.
 */
const ONLINE_METHODS = new Set(['sifalo', 'waafi', 'evc', 'edahab']);

type SB = ReturnType<typeof getSupabaseAdmin>;

interface Payout { id: number; supplierId: number; amount: number; phone: string; createdAt: string; }
interface Wallet {
  onlineTotal: number; paidOut: number; balance: number;
  payoutNumber: string | null; payouts: Payout[]; needsMigration: boolean;
}

function mapPayout(r: Record<string, unknown>): Payout {
  return {
    id:         r.id as number,
    supplierId: r.supplier_id as number,
    amount:     Number(r.amount) || 0,
    phone:      (r.phone as string) ?? '',
    createdAt:  r.created_at as string,
  };
}

/**
 * This store's share of confirmed online payments — valued at the price
 * recorded AT SALE TIME, never the current price.
 *
 * For an attributed order (orders.supplier_id — v3.7+, and checkout is
 * per-shop) the whole order was this store's sale, so we use the stored
 * `subtotal` snapshot. That closes a real exploit: previously the balance was
 * recomputed as Σ(CURRENT price × qty), so a seller could raise their price and
 * retroactively inflate their withdrawable balance beyond what was collected.
 *
 * Legacy orders with no attribution fall back to item-matching; there we prefer
 * a price snapshotted on the line item and only use the current price if none
 * was stored (pre-fix rows).
 */
async function computeOnlineTotal(sb: SB, supplierId: number): Promise<number> {
  const [{ data: owned }, { data: claims }] = await Promise.all([
    sb.from('products').select('id, price').eq('supplier_id', supplierId),
    sb.from('business_products').select('product_id, custom_price').eq('supplier_id', supplierId),
  ]);
  const priceById = new Map<number, number>();
  for (const p of owned ?? [])  priceById.set(p.id as number,         Number(p.price) || 0);
  for (const c of claims ?? []) priceById.set(c.product_id as number, Number(c.custom_price) || 0); // claim overrides

  const { data: orders } = await sb
    .from('orders').select('items, payment_method, status, supplier_id, subtotal')
    .order('created_at', { ascending: false }).limit(1000);

  let total = 0;
  for (const o of orders ?? []) {
    if (!ONLINE_METHODS.has(String(o.payment_method))) continue;
    if (NON_REVENUE_STATUSES.has(String(o.status))) continue;

    const attributed = (o as { supplier_id?: number | null }).supplier_id;
    if (attributed != null) {
      // Snapshot path: trust the amount recorded at sale time.
      if (Number(attributed) === supplierId) total += Number(o.subtotal) || 0;
      continue; // an attributed order belongs to exactly one store
    }

    // Legacy fallback (no attribution): match this store's items. Prefer the
    // price frozen on the line item; only reach for the current price if the
    // order predates the snapshot.
    if (priceById.size === 0) continue;
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      const line = it as { id: number; qty: number; price?: number };
      const snap = line.price;
      const price = snap != null && Number.isFinite(Number(snap)) ? Number(snap) : priceById.get(line.id);
      if (price != null) total += price * (Number(line.qty) || 0);
    }
  }
  return Math.round(total * 100) / 100;
}

async function loadWallet(sb: SB, supplierId: number): Promise<Wallet> {
  const onlineTotal = await computeOnlineTotal(sb, supplierId);

  let needsMigration = false;

  // Saved payout number (suppliers.payout_number — may not exist pre-migration)
  let payoutNumber: string | null = null;
  const { data: supRow, error: supErr } = await sb
    .from('suppliers').select('payout_number').eq('id', supplierId).maybeSingle();
  if (!supErr) payoutNumber = (supRow?.payout_number as string | null) ?? null;
  else if (isMissingColumnError(supErr)) needsMigration = true;
  else throw supErr;

  // Payout ledger (payouts table — may not exist pre-migration)
  let payouts: Payout[] = [];
  let paidOut = 0;
  const { data: prows, error: pErr } = await sb
    .from('payouts').select('*').eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (!pErr) {
    payouts = (prows ?? []).map(r => mapPayout(r as Record<string, unknown>));
    paidOut = Math.round(payouts.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  } else if (isMissingTableError(pErr)) needsMigration = true;
  else throw pErr;

  const balance = Math.max(0, Math.round((onlineTotal - paidOut) * 100) / 100);
  return { onlineTotal, paidOut, balance, payoutNumber, payouts, needsMigration };
}

/** Auth: signed-in owner of `supplierId` (or admin). Returns the id or a Response. */
async function guard(req: Request, supplierId: number): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsStoreOrAdmin(user.id, supplierId))) {
    return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
  }
  return null;
}

/** GET /api/payouts?supplierId=X — the store's online-payment wallet. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('supplierId');
  const supplierId = parseInt(raw ?? '', 10);
  if (Number.isNaN(supplierId)) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });

  const denied = await guard(req, supplierId);
  if (denied) return denied;

  try {
    return NextResponse.json(await loadWallet(getSupabaseAdmin(), supplierId));
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** PATCH /api/payouts — save/replace the store's payout phone number. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supplierId = parseInt(String(body.supplierId ?? ''), 10);
  const phone = String(body.phone ?? '').trim();
  if (Number.isNaN(supplierId)) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const denied = await guard(req, supplierId);
  if (denied) return denied;

  const { error } = await getSupabaseAdmin()
    .from('suppliers').update({ payout_number: phone.slice(0, 40) }).eq('id', supplierId);
  if (error) {
    if (isMissingColumnError(error)) {
      return NextResponse.json({ error: 'payout_number column missing — run migration_payouts.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  }
  return NextResponse.json({ success: true, payoutNumber: phone });
}

/** POST /api/payouts — record a payout; deducts the exact amount from balance. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supplierId = parseInt(String(body.supplierId ?? ''), 10);
  const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
  if (Number.isNaN(supplierId)) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });
  if (!(amount > 0)) return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 });

  const denied = await guard(req, supplierId);
  if (denied) return denied;

  const sb = getSupabaseAdmin();
  let wallet: Wallet;
  try {
    wallet = await loadWallet(sb, supplierId);
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }

  if (!wallet.payoutNumber) {
    return NextResponse.json({ error: 'Save your payout number first' }, { status: 400 });
  }
  if (amount > wallet.balance + 0.001) {
    return NextResponse.json({ error: `Amount exceeds your balance ($${wallet.balance.toFixed(2)})` }, { status: 400 });
  }

  const { error } = await sb.from('payouts').insert({
    supplier_id: supplierId, amount, phone: wallet.payoutNumber,
  });
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: 'payouts table missing — run migration_payouts.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  }

  // Return the refreshed wallet so the client updates the balance immediately.
  try {
    return NextResponse.json({ success: true, ...(await loadWallet(sb, supplierId)) }, { status: 201 });
  } catch {
    return NextResponse.json({ success: true }, { status: 201 });
  }
}
