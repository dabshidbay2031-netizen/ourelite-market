'use client';

import { useMemo, useState } from 'react';
import { shortMoney } from '@/lib/dashboardPeriod';

export interface TrendPoint {
  label:   string;
  revenue: number;
  profit:  number;
  orders:  number;
}

/**
 * Revenue/profit trend chart for the business dashboard.
 *
 * Deliberately hand-rolled SVG rather than a chart library: the app ships no
 * charting dependency, and this only needs one shape. What it does have that
 * the old chart didn't — a real value axis with gridlines, honest zero
 * handling, and a hover readout — is what made the old one unreadable.
 *
 * The viewBox is a fixed drawing space scaled by CSS, so it stays sharp at any
 * width without a resize observer.
 */

const W = 560;   // drawing width  (viewBox units)
const H = 190;   // plot height
const PAD_L = 46; // room for the value axis
const PAD_B = 24; // room for the category labels
const PAD_T = 10;

export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const plotW = W - PAD_L;
    const plotH = H - PAD_B - PAD_T;
    const max   = Math.max(...points.map(p => p.revenue), 0);
    // A flat-zero series would divide by zero; give it a nominal ceiling so the
    // baseline still draws instead of the chart vanishing.
    const ceiling = max > 0 ? niceCeiling(max) : 1;

    const x = (i: number) =>
      points.length <= 1 ? PAD_L + plotW / 2 : PAD_L + (i / (points.length - 1)) * plotW;
    const y = (v: number) => PAD_T + plotH - (v / ceiling) * plotH;

    const revPts  = points.map((p, i) => ({ x: x(i), y: y(p.revenue), ...p }));
    const profPts = points.map((p, i) => ({ x: x(i), y: y(Math.max(0, p.profit)) }));

    const path = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    const line = path(revPts);
    const area = points.length
      ? `${line} L ${revPts[revPts.length - 1].x.toFixed(1)} ${PAD_T + plotH} L ${revPts[0].x.toFixed(1)} ${PAD_T + plotH} Z`
      : '';

    // Four gridlines is enough to read a value off without becoming noise.
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
      v: ceiling * f,
      y: PAD_T + plotH - f * plotH,
    }));

    return { revPts, profitLine: path(profPts), line, area, ticks, plotH, x };
  }, [points]);

  const active = hover != null ? points[hover] : null;
  const hasProfit = points.some(p => p.profit !== 0);

  return (
    <div style={{ position: 'relative' }}>
      {/* Hover readout — sits above the plot so it never covers the line */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, minHeight: 22,
        fontSize: '.78rem', flexWrap: 'wrap', marginBottom: 2,
      }}>
        {active ? (
          <>
            <strong style={{ fontSize: '.85rem' }}>{active.label}</strong>
            <span style={{ color: '#4F46E5', fontWeight: 700 }}>Revenue {shortMoney(active.revenue)}</span>
            {hasProfit && <span style={{ color: '#059669', fontWeight: 700 }}>Profit {shortMoney(active.profit)}</span>}
            <span style={{ color: 'var(--text-muted)' }}>{active.orders} order{active.orders !== 1 ? 's' : ''}</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: '#4F46E5', fontWeight: 700 }}>■</span> Revenue
            {hasProfit && <> &nbsp;<span style={{ color: '#059669', fontWeight: 700 }}>■</span> Profit</>}
            &nbsp;· hover a point for detail
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 200, display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4F46E5" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Value axis + gridlines */}
        {geo.ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} y1={t.y} x2={W} y2={t.y}
              stroke="var(--border, #e2e8f0)" strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : '3 4'}
            />
            <text
              x={PAD_L - 8} y={t.y + 3.5} textAnchor="end"
              fontSize="10" fill="var(--text-muted, #94a3b8)"
            >
              {shortMoney(t.v)}
            </text>
          </g>
        ))}

        {/* Revenue area + line */}
        {geo.area && <path d={geo.area} fill="url(#trendArea)" />}
        <path d={geo.line} fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Profit line — dashed so it reads as secondary to revenue */}
        {hasProfit && (
          <path d={geo.profitLine} fill="none" stroke="#059669" strokeWidth="2"
            strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Points + hover targets */}
        {geo.revPts.map((p, i) => (
          <g key={i}>
            {hover === i && (
              <line x1={p.x} y1={PAD_T} x2={p.x} y2={PAD_T + geo.plotH} stroke="#4F46E5" strokeWidth="1" strokeDasharray="3 3" opacity=".5" />
            )}
            <circle cx={p.x} cy={p.y} r={hover === i ? 5.5 : 3.5} fill="#4F46E5" stroke="white" strokeWidth="2" />
            {/* Generous invisible hit area — the dots alone are too small to hit */}
            <rect
              x={p.x - (W - PAD_L) / Math.max(points.length, 1) / 2}
              y={PAD_T}
              width={(W - PAD_L) / Math.max(points.length, 1)}
              height={geo.plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}

        {/* Category labels — thinned out when the series is dense */}
        {points.map((p, i) => {
          const step = points.length > 8 ? Math.ceil(points.length / 7) : 1;
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={i} x={geo.x(i)} y={H - 6} textAnchor="middle"
              fontSize="10" fontWeight={hover === i ? 700 : 400}
              fill={hover === i ? 'var(--primary, #4F46E5)' : 'var(--text-muted, #94a3b8)'}
            >
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** Round an axis maximum up to a friendly number so ticks read cleanly. */
function niceCeiling(max: number): number {
  const mag  = Math.pow(10, Math.floor(Math.log10(max)));
  const step = max / mag;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return nice * mag;
}
