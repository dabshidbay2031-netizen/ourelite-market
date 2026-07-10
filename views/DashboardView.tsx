'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/hashRouter';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { authHeaders } from '@/lib/clientAuth';
import { useIsAdmin } from '@/lib/useIsAdmin';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useRealtimePing } from '@/lib/useRealtimePing';
import ErrorState from '@/components/ErrorState';
import { CATEGORIES } from '@/lib/data';
import { sumRevenue, isRevenueOrder } from '@/lib/revenue';
import type { Order } from '@/lib/types';

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

export default function DashboardPage() {
  const { state } = useApp();
  const products  = state.products;

  /* This is the GLOBAL (all-businesses) dashboard — restricted to platform
     admins. Non-admin businesses get their own scoped /my-dashboard. */
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  /* ── Real order history from the database (revenue source of truth).
     Deleted/cancelled/refunded orders stay in the list but their money is
     excluded everywhere via isRevenueOrder/sumRevenue. ── */
  const [realOrders, setRealOrders] = useState<Order[]>([]);
  const [loaded,     setLoaded]     = useState(false);
  const [error,      setError]      = useState(false);
  const loadOrders = useCallback(async (silent = false) => {
    try {
      const res = await fetch('/api/orders', { cache: 'no-store', headers: await authHeaders() });
      if (!res.ok) throw new Error('request failed');
      const d = await res.json();
      if (Array.isArray(d)) setRealOrders(d);
      setError(false);
    } catch { if (!silent) setError(true); }
    finally { if (!silent) setLoaded(true); }
  }, []);
  useEffect(() => { loadOrders(); }, [loadOrders]);
  // Live: realtime ping on any order event (admin global view), poll fallback.
  useRealtimePing([isAdmin ? 'orders' : null], () => loadOrders(true));
  useLiveRefresh(() => loadOrders(true), { enabled: isAdmin, intervalMs: 30000 });

  const hasOrders = realOrders.length > 0;

  /* ── 6-month trend, computed from real orders ── */
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleString('en-US', { month: 'short' }), revenue: 0, orders: 0 };
    });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const o of realOrders) {
      if (!isRevenueOrder(o)) continue;
      const d = new Date(o.createdAt);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i != null) { buckets[i].revenue += Number(o.total) || 0; buckets[i].orders += 1; }
    }
    return buckets;
  }, [realOrders]);

  const maxMonthlyRev = Math.max(1, ...monthly.map(m => m.revenue));
  const maxMonthlyOrd = Math.max(1, ...monthly.map(m => m.orders));
  const lastMonthOrd  = monthly[monthly.length - 1].orders;
  const growthPct = useMemo(() => {
    const firstRev = monthly.find(m => m.revenue > 0)?.revenue ?? 0;
    const lastRev  = monthly[monthly.length - 1].revenue;
    return firstRev > 0 ? Math.round(((lastRev - firstRev) / firstRev) * 100) : 0;
  }, [monthly]);

  /* SVG line path from the real monthly series */
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
    let today = 0, month = 0, monthOrders = 0, unitsFromOrders = 0;
    for (const o of realOrders) {
      if (!isRevenueOrder(o)) continue;
      const d = new Date(o.createdAt);
      const units = (o.items ?? []).reduce((n, i) => n + (Number(i.qty) || 0), 0);
      unitsFromOrders += units;
      if (d.toDateString() === todayKey) today += Number(o.total) || 0;
      if (`${d.getFullYear()}-${d.getMonth()}` === monthKey) { month += Number(o.total) || 0; monthOrders += 1; }
    }
    return { today, month, monthOrders, unitsFromOrders };
  }, [realOrders, todayKey, monthKey]);

  const totalRevenue = hasOrders
    ? sumRevenue(realOrders)
    : products.reduce((s, p) => s + p.price * p.sold, 0);
  const unitsSold = kpi.unitsFromOrders > 0
    ? kpi.unitsFromOrders
    : products.reduce((s, p) => s + p.sold, 0);

  /* ── Top products (by units sold, DB column) ── */
  const topProducts = useMemo(() => [...products].sort((a, b) => b.sold - a.sold).slice(0, 5), [products]);
  const maxTopSold  = topProducts[0]?.sold ?? 1;

  /* ── Category revenue, from real order line-items (fallback: product totals) ── */
  const catRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    let any = false;
    for (const o of realOrders) {
      if (!isRevenueOrder(o)) continue;
      for (const it of (o.items ?? [])) {
        const p = products.find(x => x.id === it.id);
        if (!p) continue;
        map[p.category] = (map[p.category] ?? 0) + p.price * (Number(it.qty) || 0);
        any = true;
      }
    }
    if (!any) products.forEach(p => { map[p.category] = (map[p.category] ?? 0) + p.price * p.sold; });
    return CATEGORIES.map(c => ({ ...c, revenue: map[c.id] ?? 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [realOrders, products]);
  const maxCatRev = catRevenue[0]?.revenue || 1;

  const verifiedSuppliers = state.suppliers.filter(s => s.verified).length;
  const supplierCount     = state.suppliers.length;

  const recentOrders = useMemo(
    () => [...realOrders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8),
    [realOrders]
  );

  /* ── Admin gate ─────────────────────────────────────────────── */
  if (adminLoading) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-icon">🔒</div>
          <div className="empty-title">Admin only</div>
          <div className="empty-sub">
            The all-businesses dashboard is restricted to platform admins.
            View your own store&apos;s performance instead.
          </div>
          <Link href="/my-dashboard" className="btn btn-primary" style={{ marginTop: 16 }}>
            My Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loaded && error && realOrders.length === 0) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <ErrorState what="the dashboard" onRetry={() => loadOrders()} />
      </div>
    );
  }

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">📊 Global Dashboard</span>
        <span className="dash-live-pill">● Live</span>
      </div>
      <p className="page-subtitle">All businesses — sales performance &amp; analytics</p>

      {/* ── KPI Cards ─────────────────────────────────── */}
      <div className="dash-kpi-grid">
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
          <div className="dash-kpi-trend neutral">{hasOrders ? 'from orders' : 'lifetime'}</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">🚚</div>
          <div className="dash-kpi-value">{supplierCount}</div>
          <div className="dash-kpi-label">Suppliers</div>
          <div className="dash-kpi-trend neutral">{verifiedSuppliers} verified</div>
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
                  <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#4F46E5" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                <path d={svg.area} fill="url(#lineAreaGrad)" />
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
                <span className="dash-order-total">${Number(o.total).toFixed(2)}</span>
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
