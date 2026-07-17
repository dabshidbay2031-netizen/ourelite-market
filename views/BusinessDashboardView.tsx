'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/hashRouter';
import Header from '@/components/Header';
import ErrorState from '@/components/ErrorState';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { authHeaders } from '@/lib/clientAuth';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useRealtimePing } from '@/lib/useRealtimePing';
import OnlinePaymentsWallet from '@/components/OnlinePaymentsWallet';
import { CATEGORIES } from '@/lib/data';
import { isRevenueOrder } from '@/lib/revenue';
import { deriveSubscription, SUBSCRIPTION_TRIAL_DAYS } from '@/lib/subscription';
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

const SVG_W = 300, SVG_H = 84;

export default function BusinessDashboardView() {
  const { currentSupplier, loading: authLoading } = useAuth();
  const { state } = useApp();
  const supplierId = currentSupplier?.id ?? null;
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
  const myOrders = useMemo(
    () => realOrders.filter(o => isRevenueOrder(o) && orderRevenue(o) > 0),
    [realOrders, orderRevenue]
  );
  const hasOrders = myOrders.length > 0;

  /* ── 6-month trend ── */
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleString('en-US', { month: 'short' }), revenue: 0, orders: 0 };
    });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const o of myOrders) {
      const d = new Date(o.createdAt);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i != null) { buckets[i].revenue += orderRevenue(o); buckets[i].orders += 1; }
    }
    return buckets;
  }, [myOrders, orderRevenue]);

  const maxMonthlyRev = Math.max(1, ...monthly.map(m => m.revenue));
  const maxMonthlyOrd = Math.max(1, ...monthly.map(m => m.orders));
  const lastMonthOrd  = monthly[monthly.length - 1].orders;
  const growthPct = useMemo(() => {
    const firstRev = monthly.find(m => m.revenue > 0)?.revenue ?? 0;
    const lastRev  = monthly[monthly.length - 1].revenue;
    return firstRev > 0 ? Math.round(((lastRev - firstRev) / firstRev) * 100) : 0;
  }, [monthly]);

  const svg = useMemo(() => {
    const pts = monthly.map((m, i) => ({
      x: (i / (monthly.length - 1)) * SVG_W,
      y: SVG_H - (m.revenue / maxMonthlyRev) * (SVG_H - 14) - 7,
    }));
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `M 0 ${SVG_H} ${line.slice(1)} L ${SVG_W} ${SVG_H} Z`;
    return { pts, line, area };
  }, [monthly, maxMonthlyRev]);

  /* ── KPI figures ── */
  const now      = new Date();
  const todayKey = now.toDateString();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const kpi = useMemo(() => {
    let today = 0, month = 0, monthOrders = 0, units = 0;
    for (const o of myOrders) {
      const d = new Date(o.createdAt);
      units += orderUnits(o);
      if (d.toDateString() === todayKey) today += orderRevenue(o);
      if (`${d.getFullYear()}-${d.getMonth()}` === monthKey) { month += orderRevenue(o); monthOrders += 1; }
    }
    return { today, month, monthOrders, units };
  }, [myOrders, todayKey, monthKey, orderRevenue, orderUnits]);

  const totalRevenue = useMemo(() => myOrders.reduce((s, o) => s + orderRevenue(o), 0), [myOrders, orderRevenue]);
  const totalProfit  = useMemo(() => myOrders.reduce((s, o) => s + orderProfit(o), 0), [myOrders, orderProfit]);
  const marginPct    = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const unitsSold    = kpi.units;

  /* ── Top products (by units sold) ── */
  const topProducts = useMemo(() => [...products].sort((a, b) => b.sold - a.sold).slice(0, 5), [products]);
  const maxTopSold  = topProducts[0]?.sold ?? 1;

  /* ── Category revenue from this business's line-items ── */
  const catRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of myOrders) {
      for (const it of (o.items ?? [])) {
        const p = prodById.get(it.id);
        if (!p) continue;
        map[p.category] = (map[p.category] ?? 0) + p.price * (Number(it.qty) || 0);
      }
    }
    return CATEGORIES.map(c => ({ ...c, revenue: map[c.id] ?? 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [myOrders, prodById]);
  const maxCatRev = catRevenue[0]?.revenue || 1;

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

      {/* Money-back window reminder — only while the seller can still refund. */}
      {sub.refundable && (
        <div className="card" style={{ margin: '0 16px 14px', padding: '11px 14px', borderRadius: 10, fontSize: '.85rem' }}>
          ✅ Subscription active. You have <strong>{sub.daysLeftToRefund} day{sub.daysLeftToRefund === 1 ? '' : 's'}</strong> left
          in your {SUBSCRIPTION_TRIAL_DAYS}-day money-back guarantee — <Link href="/billing">manage billing</Link>.
        </div>
      )}

      {/* ── Online Payments wallet (top, separate) ────── */}
      {supplierId != null && <OnlinePaymentsWallet supplierId={supplierId} />}

      {/* ── KPI Cards ─────────────────────────────────── */}
      <div className="dash-kpi-grid dash-kpi-grid-5">
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">💰</div>
          <div className="dash-kpi-value">
            {totalRevenue >= 1000 ? `$${(totalRevenue / 1000).toFixed(1)}k` : `$${totalRevenue.toFixed(0)}`}
          </div>
          <div className="dash-kpi-label">Total Revenue</div>
          <div className="dash-kpi-trend up">
            {hasOrders ? `+$${kpi.today.toFixed(0)} today` : 'No orders yet'}
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">🛍️</div>
          <div className="dash-kpi-value">{kpi.monthOrders}</div>
          <div className="dash-kpi-label">Orders / Month</div>
          <div className="dash-kpi-trend up">${kpi.month.toFixed(0)} this month</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">📦</div>
          <div className="dash-kpi-value">{unitsSold.toLocaleString()}</div>
          <div className="dash-kpi-label">Units Sold</div>
          <div className="dash-kpi-trend neutral">{hasOrders ? 'from orders' : '—'}</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">🏷️</div>
          <div className="dash-kpi-value">{products.length}</div>
          <div className="dash-kpi-label">My Products</div>
          <div className="dash-kpi-trend neutral">in catalog</div>
        </div>
        <div className="dash-kpi-card dash-kpi-wide">
          <div className="dash-kpi-icon">💵</div>
          <div className="dash-kpi-value">
            {totalProfit >= 1000 ? `$${(totalProfit / 1000).toFixed(1)}k` : `$${totalProfit.toFixed(0)}`}
          </div>
          <div className="dash-kpi-label">Total Profit</div>
          <div className="dash-kpi-trend neutral">{hasOrders ? `${marginPct}% margin` : '—'}</div>
        </div>
      </div>

      {/* ── Revenue Trend ─────────────────────────────── */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">📈 Revenue Trend</div>
            <div className="dash-card-sub">Last 6 months</div>
          </div>
          {growthPct !== 0 && (
            <div className="dash-growth-pill">
              <span>{growthPct > 0 ? '🚀' : '📉'}</span>
              <span>{growthPct > 0 ? '+' : ''}{growthPct}%</span>
            </div>
          )}
        </div>

        {hasOrders ? (
          <>
            <div className="dash-line-wrap">
              <svg viewBox={`-4 -2 ${SVG_W + 8} ${SVG_H + 4}`} preserveAspectRatio="none" className="dash-line-svg">
                <defs>
                  <linearGradient id="bizLineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#4F46E5" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                <path d={svg.area} fill="url(#bizLineAreaGrad)" />
                <path d={svg.line} fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {svg.pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4.5" fill="#4F46E5" stroke="white" strokeWidth="2.2" />
                ))}
              </svg>
              <div className="dash-line-labels">
                {monthly.map(m => <span key={m.key}>{m.month}</span>)}
              </div>
            </div>

            <div className="dash-bar-row">
              {monthly.map((m, i) => (
                <div key={m.key} className="dash-bar-col">
                  <span className="dash-bar-amt">${(m.revenue / 1000).toFixed(1)}k</span>
                  <div className="dash-bar-track">
                    <div
                      className={`dash-bar-fill${i === monthly.length - 1 ? ' current' : ''}`}
                      style={{ height: `${(m.revenue / maxMonthlyRev) * 100}%`, animationDelay: `${i * 80}ms` }}
                    />
                  </div>
                  <span className="dash-bar-lbl">{m.month}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="empty-icon">📈</div>
            <div className="empty-title">No sales yet</div>
            <div className="empty-sub">Your revenue trend appears here once orders come in.</div>
          </div>
        )}
      </div>

      {/* ── Two-col: Top Products + Category Revenue ── */}
      <div className="dash-two-col">
        <div className="dash-card">
          <div className="dash-card-title">🏆 Top Products</div>
          <div className="dash-horiz-list">
            {topProducts.map((p, i) => (
              <div key={p.id} className="dash-h-row">
                <span className="dash-rank">{i + 1}</span>
                <span className="dash-h-icon">📦</span>
                <div className="dash-h-info">
                  <div className="dash-h-name">{p.name}</div>
                  <div className="dash-horiz-track">
                    <div className="dash-horiz-fill" style={{ width: `${(p.sold / maxTopSold) * 100}%`, animationDelay: `${i * 60}ms` }} />
                  </div>
                </div>
                <span className="dash-h-val">{p.sold.toLocaleString()}</span>
              </div>
            ))}
            {topProducts.length === 0 && <div className="empty-sub" style={{ padding: 8 }}>No products yet.</div>}
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

      {/* ── Monthly Orders ──────────────────────────── */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">🗓️ Monthly Orders</div>
          <span className="dash-card-sub">{lastMonthOrd} this month</span>
        </div>
        <div className="dash-orders-bar-row">
          {monthly.map((m, i) => (
            <div key={m.key} className="dash-orders-bar-col">
              <div className="dash-orders-bar-track">
                <div className="dash-orders-bar-fill" style={{ height: `${(m.orders / maxMonthlyOrd) * 100}%`, animationDelay: `${i * 70}ms` }} />
              </div>
              <span className="dash-bar-lbl">{m.month}</span>
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
