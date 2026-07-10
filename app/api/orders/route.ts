import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingColumnError } from '@/lib/apiHelpers';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { getAuthUser, isAdminUser, ownsStoreOrAdmin } from '@/lib/apiAuth';
import { pingRealtime, runAfterResponse } from '@/lib/realtimeServer';
import { sendPushToStores, sellerStoreIds } from '@/lib/pushNotify';
import { createNotifications } from '@/lib/notify';

function mapOrder(o: Record<string, unknown>) {
  return {
    id:            o.id,
    customerName:  o.customer_name,
    customerPhone: o.customer_phone,
    userId:        o.user_id        ?? null,
    items:         o.items,
    subtotal:      o.subtotal,
    discount:      o.discount,
    total:         o.total,
    paymentMethod: o.payment_method,
    status:        o.status,
    notes:         o.notes          ?? null,
    sessionId:     o.session_id     ?? null,
    cashierName:   o.cashier_name   ?? null,
    supplierId:    o.supplier_id    ?? null,
    createdAt:     o.created_at,
  };
}

/** Collision-resistant server-side order id: prefix + ms timestamp (base36) + 4 random chars */
function newOrderId(prefix: 'ORD' | 'BULK'): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

const VALID_STATUS = new Set(['pending', 'processing', 'shipped', 'completed', 'cancelled', 'refunded', 'bulk_pending']);

/**
 * Fire the live-update fan-out for a freshly created order — realtime pings
 * (buyer, selling stores, admin dashboard) and a Web Push to the store
 * owner(s). Runs after the response so checkout latency is untouched.
 */
function notifyNewOrder(orderId: string, userId: string | null, items: OrderItem[], total: number) {
  runAfterResponse(async () => {
    const sellers = await sellerStoreIds(items);

    // In-app notifications (Notifications page + bell badge): one for the buyer,
    // one for each selling store's owner. Look up owners from the store rows.
    let ownerIds: string[] = [];
    try {
      if (sellers.length) {
        const { data } = await getSupabaseAdmin()
          .from('suppliers')
          .select('auth_user_id')
          .in('id', sellers);
        ownerIds = (data ?? [])
          .map(s => s.auth_user_id as string | null)
          .filter((v): v is string => !!v && v !== userId);
      }
    } catch { /* owners are best-effort */ }

    await createNotifications([
      ...(userId ? [{
        userId, type: 'order', icon: '🛍️',
        title:   'Order placed',
        message: `Your order ${orderId} for $${total.toFixed(2)} was placed.`,
      }] : []),
      ...ownerIds.map(owner => ({
        userId: owner, type: 'order', icon: '🛍️',
        title:   'New order received',
        message: `Order ${orderId} — $${total.toFixed(2)}`,
      })),
    ]);

    pingRealtime([
      'orders',
      'notifications',
      userId ? `user:${userId}` : null,
      ...sellers.map(s => `store:${s}`),
    ]);
    await sendPushToStores(sellers, {
      title: '🛍️ New order received',
      body:  `Order ${orderId} — $${total.toFixed(2)}`,
      url:   `/#/orders/${orderId}`,
      tag:   `order-${orderId}`,
    });
  });
}

interface OrderItem { id: number; qty: number; }

/** Parse and bound-check the items payload. Returns null if invalid. */
function parseItems(raw: unknown): OrderItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) return null;
  const items: OrderItem[] = [];
  for (const it of raw) {
    const id  = Number((it as Record<string, unknown>)?.id);
    const qty = Number((it as Record<string, unknown>)?.qty ?? 1);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!Number.isInteger(qty) || qty <= 0 || qty > 10000) return null;
    items.push({ id, qty });
  }
  return items;
}

export async function GET(req: Request) {
  // Orders carry customer PII (names, phones, totals). Reads require auth and
  // an ownership check — otherwise anyone could enumerate supplierId/userId and
  // scrape every store's order history (IDOR).
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId        = searchParams.get('userId');
  const supplierParam = searchParams.get('supplierId');

  // ── Supplier orders filter ─────────────────────────────────
  if (supplierParam !== null) {
    const supplierId = parseInt(supplierParam, 10);
    if (Number.isNaN(supplierId)) {
      return NextResponse.json({ error: 'supplierId must be a number' }, { status: 400 });
    }
    if (!(await ownsStoreOrAdmin(user.id, supplierId))) {
      return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
    }
    try {
      // A store's sellable products are BOTH the ones it owns
      // (products.supplier_id) AND the ones it claims from a wholesaler
      // (business_products). Claim-model businesses own nothing, so without
      // the claims their orders would never match.
      const sb = getSupabaseAdmin();
      const [{ data: prodData }, { data: claimData }] = await Promise.all([
        sb.from('products').select('id').eq('supplier_id', supplierId),
        sb.from('business_products').select('product_id').eq('supplier_id', supplierId),
      ]);
      const supplierProductIds = new Set<number>([
        ...((prodData  ?? []).map((p: Record<string, unknown>) => p.id         as number)),
        ...((claimData ?? []).map((c: Record<string, unknown>) => c.product_id as number)),
      ]);

      // Recent orders only — items live in JSONB so filtering happens here.
      const { data: orderData, error } = await getSupabaseAdmin()
        .from('orders').select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const filtered = (orderData ?? []).filter(o => {
        // Attributed orders (v3.7+): the order KNOWS which store sold it —
        // trust that and nothing else, so Store A never sees Store B's sale
        // of the same claimed catalog product.
        const attributed = (o as Record<string, unknown>).supplier_id;
        if (attributed != null) return Number(attributed) === supplierId;
        // Legacy orders (no attribution): fall back to item matching.
        const items = Array.isArray(o.items) ? o.items : [];
        return items.some((item: Record<string, unknown>) => supplierProductIds.has(item.id as number));
      });
      return NextResponse.json(filtered.map(o => mapOrder(o as Record<string, unknown>)));
    } catch {
      return NextResponse.json([]);
    }
  }

  // A signed-in customer may read only their OWN orders; only an admin may
  // read across users (the no-userId "all orders" dump).
  if (!userId || userId !== user.id) {
    if (!(await isAdminUser(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    let query = getSupabaseAdmin()
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data.map(mapOrder));
  } catch {
    return NextResponse.json([]);
  }
}

/**
 * POST /api/orders — server-authoritative order placement.
 *
 * The client sends WHAT it wants (items, coupon code, contact info).
 * The server decides PRICES (from the DB), DISCOUNT (validates + consumes
 * the coupon), TOTAL, the ORDER ID (collision-proof), and STOCK
 * (atomic decrement). Client-supplied subtotal/discount/total/id are ignored.
 *
 * Body: { customerName, customerPhone, userId?, items: [{id, qty}],
 *         paymentMethod?, status?, notes?, couponCode? }
 *
 * Bulk orders (paymentMethod 'bulk') are supplier inquiries: priced from
 * the DB like everything else, but stock is NOT decremented and no coupon
 * applies — nothing has been sold yet.
 */
export async function POST(req: Request) {
  // Public endpoint (guest checkout) — throttle to curb spam/abuse.
  const rl = rateLimit(`orders:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const items = parseItems(body.items);
  if (!items) {
    return NextResponse.json({ error: 'items must be a non-empty array of { id, qty } with positive integer values' }, { status: 400 });
  }

  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash';
  const isBulk        = paymentMethod === 'bulk';
  const requestedStatus = typeof body.status === 'string' && VALID_STATUS.has(body.status)
    ? body.status
    : (isBulk ? 'bulk_pending' : 'pending');
  const customerName  = String(body.customerName  ?? '').slice(0, 200);
  const customerPhone = String(body.customerPhone ?? '').slice(0, 50);
  const userId        = body.userId != null ? String(body.userId) : null;
  const notes         = body.notes != null ? String(body.notes).slice(0, 2000) : null;
  const couponCode    = typeof body.couponCode === 'string' && body.couponCode.trim() ? body.couponCode.trim() : null;
  const sessionId     = body.sessionId   != null ? String(body.sessionId)   : null;
  const cashierName   = body.cashierName != null ? String(body.cashierName) : null;
  // Which STORE sold this order (checkout shop / POS register / invoice).
  // Drives per-store dashboards; without it legacy item-matching applies.
  const supplierId    = Number.isInteger(Number(body.supplierId)) && Number(body.supplierId) > 0
    ? Number(body.supplierId) : null;

  const sb = getSupabaseAdmin();

  // ── Atomic path: place_order() RPC (schema v2) for real sales ──
  // Locks product rows, verifies + decrements stock, consumes the coupon,
  // and inserts the order in ONE transaction.
  if (!isBulk) {
    try {
      const { data, error } = await sb.rpc('place_order', {
        p_customer_name:  customerName,
        p_customer_phone: customerPhone,
        p_user_id:        userId,
        p_items:          items,
        p_payment_method: paymentMethod,
        p_coupon_code:    couponCode,
        p_notes:          notes,
      });
      if (!error && data) {
        const created = data as Record<string, unknown>;
        // The RPC predates attribution/POS columns — stamp them after the
        // fact (best-effort; ignored on pre-v3.7 schemas).
        if (supplierId != null || sessionId != null || cashierName != null) {
          const extra: Record<string, unknown> = {};
          if (supplierId  != null) extra.supplier_id  = supplierId;
          if (sessionId   != null) extra.session_id   = sessionId;
          if (cashierName != null) extra.cashier_name = cashierName;
          try {
            const { error: exErr } = await sb.from('orders').update(extra).eq('id', String(created.id));
            if (!exErr) Object.assign(created, extra);
            else if (extra.supplier_id != null) {
              // Column set may be partial (e.g. no supplier_id yet) — retry
              // with just the POS columns so a session link still lands.
              delete extra.supplier_id;
              if (Object.keys(extra).length) {
                const { error: e2 } = await sb.from('orders').update(extra).eq('id', String(created.id));
                if (!e2) Object.assign(created, extra);
              }
            }
          } catch { /* attribution is best-effort */ }
        }
        notifyNewOrder(String(created.id), userId, items, Number(created.total ?? 0));
        return NextResponse.json(mapOrder(created), { status: 201 });
      }
      if (error) {
        const code = String(error.code ?? '');
        const msg  = errMsg(error);
        // Function not installed yet (old schema) → fall through to JS path
        const fnMissing = code === 'PGRST202' || code === '42883' || msg.includes('place_order');
        if (!fnMissing) {
          // Real business failure from the transaction (e.g. insufficient stock)
          const status = msg.toLowerCase().includes('stock') ? 409 : 500;
          return NextResponse.json({ error: msg }, { status });
        }
      }
    } catch { /* fall through to JS path */ }
  }

  // ── Fallback path (works on the legacy schema) ────────────────
  // Server-side pricing is still enforced; stock decrement is
  // best-effort (not transactional) until schema v2 is applied.
  try {
    // 1. Price every item from the DB — never from the client
    const ids = items.map(i => i.id);
    const { data: prods, error: prodErr } = await sb
      .from('products').select('id, price, stock, sold').in('id', ids);
    if (prodErr) throw prodErr;

    const byId = new Map((prods ?? []).map(p => [p.id as number, p as Record<string, unknown>]));
    let subtotal = 0;
    for (const item of items) {
      const p = byId.get(item.id);
      if (!p) {
        return NextResponse.json({ error: `Product ${item.id} not found` }, { status: 400 });
      }
      if (!isBulk && (p.stock as number) < item.qty) {
        return NextResponse.json({ error: `Insufficient stock for product ${item.id}` }, { status: 409 });
      }
      subtotal += (p.price as number) * item.qty;
    }
    subtotal = Math.round(subtotal * 100) / 100;

    // 2. Validate + consume coupon server-side (sales only)
    let discount = 0;
    if (!isBulk && couponCode) {
      const { data: c } = await sb
        .from('coupons').select('*')
        .eq('code', couponCode.toUpperCase()).eq('active', true)
        .maybeSingle();
      if (c
          && (!c.expires_at || new Date(c.expires_at as string) > new Date())
          && (c.max_uses == null || (c.used_count as number) < (c.max_uses as number))
          && subtotal >= parseFloat(String(c.min_order ?? 0))) {
        const value = parseFloat(String(c.value));
        discount = c.type === 'percent'
          ? Math.round(subtotal * value) / 100
          : Math.min(value, subtotal);
        discount = Math.round(discount * 100) / 100;
        await sb.from('coupons')
          .update({ used_count: (c.used_count as number) + 1 })
          .eq('id', c.id as number);
      }
    }

    const total = Math.max(Math.round((subtotal - discount) * 100) / 100, 0);

    // 3. Insert the order FIRST — stock only moves after the order exists
    const basePayload: Record<string, unknown> = {
      id:             newOrderId(isBulk ? 'BULK' : 'ORD'),
      customer_name:  customerName,
      customer_phone: customerPhone,
      items,
      subtotal,
      discount,
      total,
      payment_method: paymentMethod,
      status:         requestedStatus,
    };
    if (userId != null) basePayload.user_id = userId;

    let order: Record<string, unknown> | null = null;
    try {
      const { data, error } = await sb
        .from('orders')
        .insert({ ...basePayload, notes, session_id: sessionId, cashier_name: cashierName, supplier_id: supplierId })
        .select().single();
      if (error) throw error;
      order = data as Record<string, unknown>;
    } catch (e0) {
      if (!isMissingColumnError(e0)) throw e0;
      try {
        const { data, error } = await sb
          .from('orders')
          .insert({ ...basePayload, notes, session_id: sessionId, cashier_name: cashierName })
          .select().single();
        if (error) throw error;
        order = data as Record<string, unknown>;
      } catch (e1) {
        if (!isMissingColumnError(e1)) throw e1;
        // Fall back progressively for pre-migration schemas
        try {
          const { data, error } = await sb
            .from('orders').insert({ ...basePayload, notes }).select().single();
          if (error) throw error;
          order = data as Record<string, unknown>;
        } catch (e2) {
          if (!isMissingColumnError(e2)) throw e2;
          const { data, error } = await sb
            .from('orders').insert(basePayload).select().single();
          if (error) throw error;
          order = data as Record<string, unknown>;
        }
      }
    }

    // 4. Decrement stock (sales only) — best-effort on legacy schema
    if (!isBulk) {
      for (const item of items) {
        const p = byId.get(item.id)!;
        await sb.from('products')
          .update({
            stock: Math.max((p.stock as number) - item.qty, 0),
            sold:  ((p.sold as number) ?? 0) + item.qty,
          })
          .eq('id', item.id);
      }
    }

    notifyNewOrder(String(order!.id), userId, items, total);
    return NextResponse.json(mapOrder(order!), { status: 201 });
  } catch (e) {
    console.error('[orders POST]', errMsg(e));
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
