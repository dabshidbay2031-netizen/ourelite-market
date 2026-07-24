'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/hashRouter';
import Header from '@/components/Header';
import ErrorState from '@/components/ErrorState';
import { useStoreActor } from '@/lib/useStoreActor';
import { useApp } from '@/context/AppContext';
import { authHeaders } from '@/lib/clientAuth';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useRealtimePing } from '@/lib/useRealtimePing';
import OnlinePaymentsWallet from '@/components/OnlinePaymentsWallet';
import { CATEGORIES } from '@/lib/data';
import { isRevenueOrder, orderChannel } from '@/lib/revenue';
import { deriveSubscription, SUBSCRIPTION_TRIAL_DAYS } from '@/lib/subscription';
import TrendChart from '@/components/TrendChart';
import { buildBuckets, bucketIndexFor, PERIOD_META, shortMoney, type Period } from '@/lib/dashboardPeriod';
import type { Order, Product } from '@/lib/types';

/**
 * Per-business dashboard — scoped to the SIGNED-IN business/supplier only.
 *
 * Unlike the global DashboardView (admin-only, all businesses), every figure
 * here is computed from just this account's own products and the orders that
 * contain them. Revenue/units count only the line-items that belong to this
 * business, so an order split across several sellers contributes only this
 * business's share.
 */

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  completed:    { bg: '#d1fae5', color: '#059669' },
  pending:      { bg: '#fef3c7', color: '#d97706' },
  processing:   { bg: '#dbeafe', color: '#2563eb' },
  shipped:      { bg: '#e0e7ff', color: '#4f46e5' },
  cancelled:    { bg: '#fee2e2', color: '#dc2626' },
  refunded:     { bg: '#ede9fe', color: '#7c3aed' },
  deleted:      { bg: '#f3f4f6', color: '#6b7280' },
  bulk_pending: { bg: '#ede9fe', color: '#7c3aed' },
};


export default function BusinessDashboardView() {
  // Owner OR a staff cashier with the 'dashboard' privilege operating the store.
  const actor = useStoreActor();
  const currentSupplier = actor.store;
  const authLoading = actor.loading;
  const { state } = useApp();
  const supplierId = actor.storeId;
  const sub = useMemo(() => deriveSubscription(currentSupplier), [currentSupplier]);

  /* ── This business's own products + orders ── */
  const [claimedProducts, setClaimedProducts] = useState<Product[]>([]);
  const [realOrders, setRealOrders] = useState<Order[]>([]);
  const [loaded,     setLoaded]     = useState(false);
  const [error,      setError]      = useState(false);

  const load = useCallback(async (silent = false) => {
    if (supplierId == null) return;
    if (!silent) setLoaded(false);
    try {
      // Claimed products: catalog rows this store sources from a wholesaler,
      // at ITS OWN price/stock (custom_price / stock_qty). Owned catalog rows
      // are merged in below from the global product list.
      // The orders endpoint carries customer PII → needs the caller's JWT.
      const [bpRes, oRes] = await Promise.all([
        fetch(`/api/business-products?supplierId=${supplierId}`, { cache: 'no-store' }),
        fetch(`/api/orders?supplierId=${supplierId}`, { cache: 'no-store', headers: await authHeaders() }),
      ]);
      if (!bpRes.ok || !oRes.ok) throw new Error('request failed');
      const [bp, o] = await Promise.all([bpRes.json(), oRes.json()]);
      setError(false);
      if (Array.isArray(bp)) {
        const claimed = bp
          .filter((row: { isActive?: boolean; product?: Product | null }) => row.isActive && row.product)
          .map((row: { customPrice?: number; stockQty?: number; moq?: number; product: Product }) => ({
            ...row.product,
            price: Number(row.customPrice ?? row.product.price),
            // This business's cost is what it pays the wholesaler — i.e. the
            // catalog's own price, not the wholesaler's input cost (which is
            // irrelevant to a business buying through the claim model).
            cost:  Number(row.product.price),
            stock: Number(row.stockQty ?? 0),
            moq:   row.moq ?? 1,
          }) as Product);
        setClaimedProducts(claimed);
      }
      if (Array.isArray(o)) setRealOrders(o);
    } catch {
      // Keep the last good data on a silent refresh; only surface the error
      // screen when the FIRST load fails and there's nothing to show.
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoaded(true);
    }
  }, [supplierId]);

  /* Everything this store sells: catalog rows it OWNS + rows it CLAIMS.
     Without the owned rows, a store selling its own products showed $0
     revenue — only claim-model sales were being counted. */
  const products = useMemo(() => {
    const byId = new Map<number, Product>();
    for (const p of state.products) if (p.supplierId === supplierId) byId.set(p.id, p);
    for (const p of claimedProducts) byId.set(p.id, p); // claim record wins (own price/stock)
    return Array.from(byId.values());
  }, [state.products, supplierId, claimedProducts]);

  useEffect(() => { load(); }, [load]);
  // Live: realtime ping on new orders/claims for this store, poll as fallback.
  useRealtimePing([supplierId != null ? `store:${supplierId}` : null], () => load(true));
  useLiveRefresh(() => load(true), { enabled: supplierId != null, intervalMs: 30000 });

  /* ── This business's line-item share of any order ── */
  const prodById     = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const myProductIds = useMemo(() => new Set(products.map(p => p.id)), [products]);

  const orderRevenue = useMemo(() => (o: Order) =>
    (o.items ?? []).reduce((s, it) => myProductIds.has(it.id)
      ? s + (prodById.get(it.id)?.price ?? 0) * (Number(it.qty) || 0) : s, 0),
  [myProductIds, prodById]);

  const orderProfit = useMemo(() => (o: Order) =>
    (o.items ?? []).reduce((s, it) => {
      if (!myProductIds.has(it.id)) return s;
      const p = prodById.get(it.id);
      if (!p) return s;
      return s + ((p.price ?? 0) - (p.cost ?? 0)) * (Number(it.qty) || 0);
    }, 0),
  [myProductIds, prodById]);

  const orderUnits = useMemo(() => (o: Order) =>
    (o.items ?? []).reduce((s, it) => myProductIds.has(it.id)
      ? s + (Number(it.qty) || 0) : s, 0),
  [myProductIds]);

  /* Orders that actually contain something this business sells (revenue only) */
  const allMyOrders = useMemo(
    () => realOrders.filter(o => isRevenueOrder(o) && orderRevenue(o) > 0),
    [realOrders, orderRevenue]
  );

  /* ── Sales channel: All · Online (web) · In-store (POS) ── */
  const [channel, setChannel] = useState<'all' | 'online' | 'pos'>('all');
  const channelCounts = useMemo(() => {
    let online = 0, pos = 0;
    for (const o of allMyOrders) (orderChannel(o) === 'pos' ? pos++ : online++);
    return { all: allMyOrders.length, online, pos };
  }, [allMyOrders]);

  // Everything below (KPIs, trend, top products, category revenue, recent)
  // derives from `myOrders`, so scoping it here re-scopes the whole dashboard.
  const myOrders = useMemo(
    () => channel === 'all' ? allMyOrders : allMyOrders.filter(o => orderChannel(o) === channel),
    [allMyOrders, channel]
  );

  /* ── Period filter: Daily · Weekly · Monthly · Yearly ──
     Drives BOTH the chart and every headline figure below, so the numbers
     always describe the window the owner is actually looking at. */
  const [period, setPeriod] = useState<Period>('month');
  const buckets = useMemo(() => buildBuckets(period), [period]);

  const orderCost = useMemo(() => (o: Order) =>
    (o.items ?? []).reduce((s, it) => {
      if (!myProductIds.has(it.id)) return s;
      const p = prodById.get(it.id);
      return p ? s + (p.cost ?? 0) * (Number(it.qty) || 0) : s;
    }, 0),
  [myProductIds, prodById]);

  /** Orders inside the selected window — the basis for every stat on screen. */
  const periodOrders = useMemo(() => {
    const from = buckets[0]?.start.getTime() ?? 0;
    return myOrders.filter(o => new Date(o.createdAt).getTime() >= from);
  }, [myOrders, buckets]);

  /* Per-bucket totals for the chart. */
  const series = useMemo(() => {
    const rows = buckets.map(b => ({
      key: b.key, label: b.label, revenue: 0, cost: 0, profit: 0, orders: 0, units: 0,
    }));
    for (const o of periodOrders) {
      const i = bucketIndexFor(new Date(o.createdAt), buckets);
      if (i < 0) continue;
      rows[i].revenue += orderRevenue(o);
      rows[i].cost    += orderCost(o);
      rows[i].profit  += orderProfit(o);
      rows[i].orders  += 1;
      rows[i].units   += orderUnits(o);
    }
    return rows;
  }, [periodOrders, buckets, orderRevenue, orderCost, orderProfit, orderUnits]);

  const maxBucketOrders = Math.max(1, ...series.map(s => s.orders));

  /** Growth: this bucket vs the previous one — the comparison an owner expects. */
  const growthPct = useMemo(() => {
    if (series.length < 2) return 0;
    const curr = series[series.length - 1].revenue;
    const prev = series[series.length - 2].revenue;
    if (prev <= 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }, [series]);

  /* ── Headline figures for the SELECTED period ── */
  const totals = useMemo(() => series.reduce(
    (t, s) => ({
      revenue: t.revenue + s.revenue,
      cost:    t.cost    + s.cost,
      profit:  t.profit  + s.profit,
      orders:  t.orders  + s.orders,
      units:   t.units   + s.units,
    }),
    { revenue: 0, cost: 0, profit: 0, orders: 0, units: 0 },
  ), [series]);

  const totalRevenue = totals.revenue;
  const totalCost    = totals.cost;
  const totalProfit  = totals.profit;
  const marginPct    = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const unitsSold    = totals.units;
  const avgOrder     = totals.orders > 0 ? totalRevenue / totals.orders : 0;

  /* ── Category revenue from this business's line-items (selected period) ── */
  const catRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of periodOrders) {
      for (const it of (o.items ?? [])) {
        const p = prodById.get(it.id);
        if (!p) continue;
        map[p.category] = (map[p.category] ?? 0) + p.price * (Number(it.qty) || 0);
      }
    }
    return CATEGORIES.map(c => ({ ...c, revenue: map[c.id] ?? 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [periodOrders, prodById]);
  const maxCatRev = catRevenue[0]?.revenue || 1;

  /* Best sellers BY UNITS ACTUALLY SOLD in the period (the old list used the
     product's all-time `sold` counter, which ignored the filter entirely). */
  const topProductsPeriod = useMemo(() => {
    const tally = new Map<number, { name: string; units: number; revenue: number }>();
    for (const o of periodOrders) {
      for (const it of (o.items ?? [])) {
        if (!myProductIds.has(it.id)) continue;
        const p = prodById.get(it.id);
        if (!p) continue;
        const row = tally.get(it.id) ?? { name: p.name, units: 0, revenue: 0 };
        row.units   += Number(it.qty) || 0;
        row.revenue += (p.price ?? 0) * (Number(it.qty) || 0);
        tally.set(it.id, row);
      }
    }
    return Array.from(tally.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [periodOrders, prodById, myProductIds]);
  const maxTopUnits = topProductsPeriod[0]?.units || 1;

  const recentOrders = useMemo(
    () => [...myOrders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8),
    [myOrders]
  );

  /* ── First load failed (network/server) ── */
  if (loaded && error && products.length === 0) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <ErrorState what="your dashboard" onRetry={() => load()} />
      </div>
    );
  }

  /* ── No business account resolved (e.g. a customer) ── */
  if (!authLoading && supplierId == null) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-icon">🏪</div>
          <div className="empty-title">No business account</div>
          <div className="empty-sub">Sign in with a business account to see your dashboard.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">📊 {currentSupplier?.name ?? 'My'} Dashboard</span>
        <span className="dash-live-pill">● Live</span>
        <Link href="/billing" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>💳 Billing</Link>
      </div>
      <p className="page-subtitle">Your store&apos;s sales performance &amp; analytics</p>

      {/* ── Sales channel tabs: split Online (web) vs In-store (POS) ── */}
      <div style={{ padding: '0 16px 12px' }}>
        <div className="dash-channel-tabs" role="tablist" aria-label="Sales channel">
          {([
            { key: 'all',    label: '📊 All sales',  count: channelCounts.all },
            { key: 'online', label: '🌐 Online',     count: channelCounts.online },
            { key: 'pos',    label: '🏬 In-store',   count: channelCounts.pos },
          ] as const).map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={channel === t.key}
              className={`dash-channel-tab${channel === t.key ? ' active' : ''}`}
              onClick={() => setChannel(t.key)}
            >
              <span>{t.label}</span>
              <span className="dash-channel-count">{t.count}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', margin: '8px 2px 0' }}>
          {channel === 'online'
            ? 'Sales placed by customers through the web/app.'
            : channel === 'pos'
              ? 'Sales rung up in person at your register (POS).'
              : 'Online and in-store sales combined.'}
        </p>
      </div>

      {/* Money-back window reminder — only while the seller can still refund. */}
      {sub.refundable && (
        <div className="card" style={{ margin: '0 16px 14px', padding: '11px 14px', borderRadius: 10, fontSize: '.85rem' }}>
          ✅ Subscription active. You have <strong>{sub.daysLeftToRefund} day{sub.daysLeftToRefund === 1 ? '' : 's'}</strong> left
          in your {SUBSCRIPTION_TRIAL_DAYS}-day money-back guarantee — <Link href="/billing">manage billing</Link>.
        </div>
      )}

      {/* ── Online Payments wallet (top, separate) ────── */}
      {supplierId != null && <OnlinePaymentsWallet supplierId={supplierId} />}

      {/* ── Period filter — scopes every figure and chart below ── */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Time period">
          {(['day', 'week', 'month', 'year'] as const).map(p => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              className={`chip ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_META[p].label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '.76rem', color: 'var(--text-muted)' }}>
            {PERIOD_META[period].sub}
          </span>
        </div>
      </div>

      {/* ── KPI Cards — all scoped to the selected period ── */}
      <div className="dash-kpi-grid dash-kpi-grid-5">
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">💰</div>
          <div className="dash-kpi-value">{shortMoney(totalRevenue)}</div>
          <div className="dash-kpi-label">Revenue</div>
          <div className={`dash-kpi-trend ${growthPct >= 0 ? 'up' : 'down'}`}>
            {totals.orders > 0
              ? `${growthPct >= 0 ? '▲' : '▼'} ${Math.abs(growthPct)}% vs previous`
              : 'No sales in this period'}
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">🧾</div>
          <div className="dash-kpi-value">{shortMoney(totalCost)}</div>
          <div className="dash-kpi-label">Total Costs</div>
          <div className="dash-kpi-trend neutral">
            {totalRevenue > 0 ? `${Math.round((totalCost / totalRevenue) * 100)}% of revenue` : '—'}
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">💵</div>
          <div className="dash-kpi-value">{shortMoney(totalProfit)}</div>
          <div className="dash-kpi-label">Profit</div>
          <div className={`dash-kpi-trend ${totalProfit >= 0 ? 'up' : 'down'}`}>
            {totals.orders > 0 ? `${marginPct}% margin` : '—'}
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">🛍️</div>
          <div className="dash-kpi-value">{totals.orders.toLocaleString()}</div>
          <div className="dash-kpi-label">Orders</div>
          <div className="dash-kpi-trend neutral">
            {totals.orders > 0 ? `${shortMoney(avgOrder)} avg` : '—'}
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">📦</div>
          <div className="dash-kpi-value">{unitsSold.toLocaleString()}</div>
          <div className="dash-kpi-label">Units Sold</div>
          <div className="dash-kpi-trend neutral">
            {products.length} product{products.length !== 1 ? 's' : ''} listed
          </div>
        </div>
      </div>

      {/* ── Revenue Trend ─────────────────────────────── */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">📈 Revenue &amp; Profit</div>
            <div className="dash-card-sub">{PERIOD_META[period].sub}</div>
          </div>
          {totals.orders > 0 && growthPct !== 0 && (
            <div className="dash-growth-pill">
              <span>{growthPct > 0 ? '🚀' : '📉'}</span>
              <span>{growthPct > 0 ? '+' : ''}{growthPct}%</span>
            </div>
          )}
        </div>

        {totals.orders > 0 ? (
          <TrendChart points={series.map(s => ({
            label: s.label, revenue: s.revenue, profit: s.profit, orders: s.orders,
          }))} />
        ) : (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="empty-icon">📈</div>
            <div className="empty-title">No sales in this period</div>
            <div className="empty-sub">Try a wider period, or your trend appears here once orders come in.</div>
          </div>
        )}
      </div>

      {/* ── Two-col: Top Products + Category Revenue ── */}
      <div className="dash-two-col">
        <div className="dash-card">
          <div className="dash-card-title">🏆 Top Products</div>
          <div className="dash-horiz-list">
            {topProductsPeriod.map((p, i) => (
              <div key={p.id} className="dash-h-row">
                <span className="dash-rank">{i + 1}</span>
                <span className="dash-h-icon">📦</span>
                <div className="dash-h-info">
                  <div className="dash-h-name">{p.name}</div>
                  <div className="dash-horiz-track">
                    <div className="dash-horiz-fill" style={{ width: `${(p.units / maxTopUnits) * 100}%`, animationDelay: `${i * 60}ms` }} />
                  </div>
                </div>
                <span className="dash-h-val" title={`${shortMoney(p.revenue)} revenue`}>{p.units.toLocaleString()}</span>
              </div>
            ))}
            {topProductsPeriod.length === 0 && <div className="empty-sub" style={{ padding: 8 }}>No sales in this period.</div>}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-title">🗂️ By Category</div>
          <div className="dash-horiz-list">
            {catRevenue.filter(c => c.revenue > 0).slice(0, 6).map((c, i) => (
              <div key={c.id} className="dash-h-row">
                <span className="dash-h-icon">{c.icon}</span>
                <div className="dash-h-info">
                  <div className="dash-h-name">{c.name}</div>
                  <div className="dash-horiz-track">
                    <div className="dash-horiz-fill" style={{ width: `${(c.revenue / maxCatRev) * 100}%`, background: c.color, animationDelay: `${i * 60}ms` }} />
                  </div>
                </div>
                <span className="dash-h-val">${(c.revenue / 1000).toFixed(1)}k</span>
              </div>
            ))}
            {catRevenue.every(c => c.revenue === 0) && <div className="empty-sub" style={{ padding: 8 }}>No category sales yet.</div>}
          </div>
        </div>
      </div>

      {/* ── Orders per period bucket ────────────────── */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">🗓️ Orders</div>
          <span className="dash-card-sub">{totals.orders} in {PERIOD_META[period].sub.toLowerCase()}</span>
        </div>
        <div className="dash-orders-bar-row">
          {series.map((s, i) => (
            <div key={s.key} className="dash-orders-bar-col" title={`${s.label}: ${s.orders} order${s.orders !== 1 ? 's' : ''}`}>
              <div className="dash-orders-bar-track">
                <div className="dash-orders-bar-fill" style={{ height: `${(s.orders / maxBucketOrders) * 100}%`, animationDelay: `${i * 40}ms` }} />
              </div>
              <span className="dash-bar-lbl">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Orders ──────────────────────────── */}
      <div className="dash-card" style={{ marginBottom: 80 }}>
        <div className="dash-card-header">
          <div className="dash-card-title">🕐 Recent Orders</div>
          <Link href="/orders" className="dash-see-all">View all →</Link>
        </div>
        <div className="dash-order-list">
          {recentOrders.map(o => {
            const st = STATUS_COLOR[o.status] ?? STATUS_COLOR.pending;
            return (
              <Link key={o.id} href={`/orders/${o.id}`} className="dash-order-row">
                <span className="dash-order-id">{o.id}</span>
                <span className="dash-order-name">{o.customerName}</span>
                <span className="dash-order-total">${orderRevenue(o).toFixed(2)}</span>
                <span className="dash-order-badge" style={{ background: st.bg, color: st.color }}>{o.status}</span>
              </Link>
            );
          })}
          {loaded && recentOrders.length === 0 && (
            <div className="empty-sub" style={{ padding: 8 }}>No orders yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
