'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { CATEGORIES } from '@/lib/data';

/* ── Static 6-month trend (frontend-only) ── */
const MONTHLY = [
  { month: 'Dec', revenue: 18_400, orders: 42  },
  { month: 'Jan', revenue: 24_600, orders: 58  },
  { month: 'Feb', revenue: 31_200, orders: 71  },
  { month: 'Mar', revenue: 38_900, orders: 89  },
  { month: 'Apr', revenue: 52_300, orders: 114 },
  { month: 'May', revenue: 71_800, orders: 156 },
];

/* ── Chart constants derived from MONTHLY (no big arrays needed) ── */
const MAX_MONTHLY_REV = Math.max(...MONTHLY.map(m => m.revenue));
const GROWTH_PCT      = Math.round(
  ((MONTHLY[MONTHLY.length - 1].revenue - MONTHLY[0].revenue) / MONTHLY[0].revenue) * 100
);
const SVG_W = 300, SVG_H = 84;
const SVG_PTS = MONTHLY.map((m, i) => ({
  x: (i / (MONTHLY.length - 1)) * SVG_W,
  y: SVG_H - (m.revenue / MAX_MONTHLY_REV) * (SVG_H - 14) - 7,
}));
const LINE_D = SVG_PTS.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
const AREA_D = `M 0 ${SVG_H} ${LINE_D.slice(1)} L ${SVG_W} ${SVG_H} Z`;

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  completed:   { bg: '#d1fae5', color: '#059669' },
  pending:     { bg: '#fef3c7', color: '#d97706' },
  processing:  { bg: '#dbeafe', color: '#2563eb' },
  cancelled:   { bg: '#fee2e2', color: '#dc2626' },
  bulk_pending:{ bg: '#ede9fe', color: '#7c3aed' },
};

export default function DashboardPage() {
  const { state } = useApp();
  const products  = state.products;
  const orders    = state.orders ?? [];

  /* ── Computed from live AppContext state (not static imports) ── */
  const totalRevenue = useMemo(
    () => products.reduce((s, p) => s + p.price * p.sold, 0),
    [products]
  );
  const totalSold = useMemo(
    () => products.reduce((s, p) => s + p.sold, 0),
    [products]
  );
  const topProducts = useMemo(
    () => [...products].sort((a, b) => b.sold - a.sold).slice(0, 5),
    [products]
  );
  const maxTopSold = topProducts[0]?.sold ?? 1;

  const catRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach(p => { map[p.category] = (map[p.category] ?? 0) + p.price * p.sold; });
    return CATEGORIES.map(c => ({ ...c, revenue: map[c.id] ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [products]);
  const maxCatRev = catRevenue[0]?.revenue ?? 1;

  const supplierCount = state.suppliers.length || 6;

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">📊 Dashboard</span>
        <span className="dash-live-pill">● Live</span>
      </div>
      <p className="page-subtitle">Real-time sales performance &amp; analytics</p>

      {/* ── KPI Cards ─────────────────────────────────── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">💰</div>
          <div className="dash-kpi-value">${(totalRevenue / 1000).toFixed(0)}k</div>
          <div className="dash-kpi-label">Total Revenue</div>
          <div className="dash-kpi-trend up">↑ 37% this month</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">🛍️</div>
          <div className="dash-kpi-value">{MONTHLY[MONTHLY.length - 1].orders}</div>
          <div className="dash-kpi-label">Orders / Month</div>
          <div className="dash-kpi-trend up">↑ 37% vs last</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">📦</div>
          <div className="dash-kpi-value">{totalSold.toLocaleString()}</div>
          <div className="dash-kpi-label">Units Sold</div>
          <div className="dash-kpi-trend up">↑ 22% this week</div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">🚚</div>
          <div className="dash-kpi-value">{supplierCount}</div>
          <div className="dash-kpi-label">Suppliers</div>
          <div className="dash-kpi-trend neutral">All verified</div>
        </div>
      </div>

      {/* ── Revenue Trend ─────────────────────────────── */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">📈 Revenue Trend</div>
            <div className="dash-card-sub">6-month performance</div>
          </div>
          <div className="dash-growth-pill">
            <span>🚀</span>
            <span>+{GROWTH_PCT}%</span>
          </div>
        </div>

        <div className="dash-line-wrap">
          <svg viewBox={`-4 -2 ${SVG_W + 8} ${SVG_H + 4}`} preserveAspectRatio="none" className="dash-line-svg">
            <defs>
              <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#4F46E5" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path d={AREA_D} fill="url(#lineAreaGrad)" />
            <path d={LINE_D} fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {SVG_PTS.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="4.5" fill="#4F46E5" stroke="white" strokeWidth="2.2" />
            ))}
          </svg>
          <div className="dash-line-labels">
            {MONTHLY.map(m => <span key={m.month}>{m.month}</span>)}
          </div>
        </div>

        <div className="dash-bar-row">
          {MONTHLY.map((m, i) => (
            <div key={m.month} className="dash-bar-col">
              <span className="dash-bar-amt">${(m.revenue / 1000).toFixed(0)}k</span>
              <div className="dash-bar-track">
                <div
                  className={`dash-bar-fill${i === MONTHLY.length - 1 ? ' current' : ''}`}
                  style={{ height: `${(m.revenue / MAX_MONTHLY_REV) * 100}%`, animationDelay: `${i * 80}ms` }}
                />
              </div>
              <span className="dash-bar-lbl">{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two-col: Top Products + Category Revenue ── */}
      <div className="dash-two-col">
        <div className="dash-card">
          <div className="dash-card-title">🏆 Top Products</div>
          <div className="dash-horiz-list">
            {topProducts.map((p, i) => (
              <div key={p.id} className="dash-h-row">
                <span className="dash-rank">{i + 1}</span>
                <span className="dash-h-icon">{p.icon}</span>
                <div className="dash-h-info">
                  <div className="dash-h-name">{p.name}</div>
                  <div className="dash-horiz-track">
                    <div className="dash-horiz-fill" style={{ width: `${(p.sold / maxTopSold) * 100}%`, animationDelay: `${i * 60}ms` }} />
                  </div>
                </div>
                <span className="dash-h-val">{p.sold.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-title">🗂️ By Category</div>
          <div className="dash-horiz-list">
            {catRevenue.map((c, i) => (
              <div key={c.id} className="dash-h-row">
                <span className="dash-h-icon">{c.icon}</span>
                <div className="dash-h-info">
                  <div className="dash-h-name">{c.name}</div>
                  <div className="dash-horiz-track">
                    <div className="dash-horiz-fill" style={{ width: `${(c.revenue / maxCatRev) * 100}%`, background: c.color, animationDelay: `${i * 60}ms` }} />
                  </div>
                </div>
                <span className="dash-h-val">${(c.revenue / 1000).toFixed(0)}k</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Monthly Orders ──────────────────────────── */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">🗓️ Monthly Orders</div>
          <span className="dash-card-sub">{MONTHLY[MONTHLY.length - 1].orders} this month</span>
        </div>
        <div className="dash-orders-bar-row">
          {MONTHLY.map((m, i) => (
            <div key={m.month} className="dash-orders-bar-col">
              <div className="dash-orders-bar-track">
                <div className="dash-orders-bar-fill" style={{ height: `${(m.orders / MONTHLY[MONTHLY.length - 1].orders) * 100}%`, animationDelay: `${i * 70}ms` }} />
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
          {[...orders].reverse().slice(0, 8).map(o => {
            const st = STATUS_COLOR[o.status] ?? STATUS_COLOR.pending;
            return (
              <div key={o.id} className="dash-order-row">
                <span className="dash-order-id">{o.id}</span>
                <span className="dash-order-name">{o.customerName}</span>
                <span className="dash-order-total">${Number(o.total).toFixed(2)}</span>
                <span className="dash-order-badge" style={{ background: st.bg, color: st.color }}>{o.status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
