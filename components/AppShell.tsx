'use client';

/**
 * APP SHELL — single-page renderer
 * ──────────────────────────────────────────────────────────────────
 * All main pages are lazy-imported here and rendered as React
 * components. Switching between them is a pure state update — no
 * network, no compilation, no delay. Typically < 20ms.
 *
 * Pages are loaded lazily (split per-view) but once a view has been
 * loaded once it stays in memory, so going back to it is always instant.
 */

import React, { lazy, Suspense, memo } from 'react';
import { useView } from '@/context/ViewContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = React.LazyExoticComponent<React.ComponentType<any>>;

/* ── Lazy-load every main page ──────────────────────────────────── */
// NOTE: We do NOT import '@/app/page' here — that would create a circular
// dependency (page.tsx imports AppShell → AppShell imports page.tsx).
// The ExplorePage (/) is rendered directly by page.tsx; AppShell only
// handles non-root paths.
const DashboardPage = lazy(() => import('@/app/dashboard/page')) as AnyPage;
const SearchPage    = lazy(() => import('@/app/search/page'))    as AnyPage;
const POSPage       = lazy(() => import('@/app/pos/page'))       as AnyPage;
const InventoryPage = lazy(() => import('@/app/inventory/page')) as AnyPage;
const SuppliersPage = lazy(() => import('@/app/suppliers/page')) as AnyPage;
const CustomersPage = lazy(() => import('@/app/customers/page')) as AnyPage;
const OrdersPage    = lazy(() => import('@/app/orders/page'))    as AnyPage;
const NotifPage     = lazy(() => import('@/app/notifications/page')) as AnyPage;
const SettingsPage  = lazy(() => import('@/app/settings/page'))  as AnyPage;
const ProfilePage   = lazy(() => import('@/app/profile/page'))   as AnyPage;
const ChatListPage  = lazy(() => import('@/app/chat/page'))      as AnyPage;
const CheckoutPage  = lazy(() => import('@/app/checkout/page'))  as AnyPage;

/* ── Loading skeleton (shown only on first visit to a view) ─────── */
const ViewSkeleton = memo(function ViewSkeleton() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', flexDirection: 'column', gap: 12,
    }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
      <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>Loading…</span>
    </div>
  );
});

/* ── Route table ────────────────────────────────────────────────── */
type RouteEntry = { pattern: RegExp | string; component: AnyPage };

const ROUTES: RouteEntry[] = [
  { pattern: /^\/product\//,   component: lazy(() => import('@/app/product/[id]/page'))  as AnyPage },
  { pattern: /^\/supplier\//,  component: lazy(() => import('@/app/supplier/[id]/page')) as AnyPage },
  { pattern: /^\/orders\//,    component: lazy(() => import('@/app/orders/[id]/page'))   as AnyPage },
  { pattern: /^\/chat\//,      component: lazy(() => import('@/app/chat/[id]/page'))     as AnyPage },
  // '/' is handled by page.tsx directly — not here
  { pattern: '/dashboard',     component: DashboardPage },
  { pattern: '/search',        component: SearchPage },
  { pattern: '/pos',           component: POSPage },
  { pattern: '/inventory',     component: InventoryPage },
  { pattern: '/suppliers',     component: SuppliersPage },
  { pattern: '/customers',     component: CustomersPage },
  { pattern: '/orders',        component: OrdersPage },
  { pattern: '/notifications', component: NotifPage },
  { pattern: '/settings',      component: SettingsPage },
  { pattern: '/profile',       component: ProfilePage },
  { pattern: '/chat',          component: ChatListPage },
  { pattern: '/checkout',      component: CheckoutPage },
];

function matchRoute(path: string): AnyPage | null {
  for (const r of ROUTES) {
    if (r.pattern instanceof RegExp) {
      if (r.pattern.test(path)) return r.component;
    } else if (path === r.pattern) {
      return r.component;
    }
  }
  return null; // '/' is handled by page.tsx, not AppShell
}

/**
 * Extract a dynamic param from the path, e.g.
 * /product/42 → { id: '42' }
 */
function extractParam(path: string): { params: Record<string, string> } {
  const segments = path.split('/').filter(Boolean);
  return { params: { id: segments[segments.length - 1] ?? '' } };
}

/* ── Main shell component ───────────────────────────────────────── */
export default function AppShell() {
  const { viewPath } = useView();
  const View = matchRoute(viewPath);

  if (!View) return null;

  // Dynamic pages need the id param
  const isDynamic = /\/(product|supplier|orders|chat)\//.test(viewPath);
  const props = isDynamic ? extractParam(viewPath) : {};

  return (
    <Suspense fallback={<ViewSkeleton />}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <View {...(props as any)} />
    </Suspense>
  );
}
