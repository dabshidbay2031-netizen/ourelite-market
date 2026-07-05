'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from '@/lib/hashRouter';
import Header from '@/components/Header';
import { authHeaders } from '@/lib/clientAuth';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import ErrorState from '@/components/ErrorState';

interface OrderItem { id: number; qty: number; }
interface Order {
  id: string; customerName: string; customerPhone: string;
  items: OrderItem[]; subtotal: number; discount: number; total: number;
  paymentMethod: string; status: string; notes?: string; createdAt: string; userId?: string;
}

const STATUS_OPTIONS = ['pending','processing','completed','cancelled','bulk_pending'];
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  completed:   { label: 'Completed',  color: '#059669', bg: '#d1fae5' },
  pending:     { label: 'Pending',    color: '#d97706', bg: '#fef3c7' },
  processing:  { label: 'Processing', color: '#2563eb', bg: '#dbeafe' },
  cancelled:   { label: 'Cancelled',  color: '#dc2626', bg: '#fee2e2' },
  bulk_pending:{ label: 'Bulk Order', color: '#7c3aed', bg: '#ede9fe' },
  // Soft-deleted: stays in the history forever, excluded from revenue
  deleted:     { label: '🗑 Deleted', color: '#6b7280', bg: '#f3f4f6' },
};
const PAY_ICON: Record<string, string> = { waafi:'📱', cash:'💵', card:'💳', bulk:'📦' };

type Tab = 'mine' | 'store';

export default function OrdersPage() {
  const router = useRouter();
  const { user, accountType, currentSupplier, loading: authLoading } = useAuth();
  const { state, toast } = useApp();
  const { products } = state;

  // Sellers (business/supplier with a store) also get a "My Store" tab showing
  // the orders their store has received. Everyone else only sees "My Orders".
  const isSeller = (accountType === 'business' || accountType === 'supplier') && !!currentSupplier;

  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [tab, setTab]               = useState<Tab>('mine');
  const [statusEditing, setStatusEditing] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Non-sellers can never be on the store tab.
  const activeTab: Tab = isSeller ? tab : 'mine';

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const url = activeTab === 'store' && currentSupplier
        ? `/api/orders?supplierId=${currentSupplier.id}`
        : user ? `/api/orders?userId=${user.id}` : null;
      if (!url) { setOrders([]); if (!silent) setLoading(false); return; }
      const res  = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      setError(false);
    } catch {
      // Don't wipe good data on a background refresh; only flag a failed
      // foreground load so the user sees Retry instead of a fake "no orders".
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user, activeTab, currentSupplier]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  // Live: re-pull silently every 10s + on tab focus, no skeleton flash.
  useLiveRefresh(() => loadOrders(true), { intervalMs: 10000 });

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setStatusEditing(orderId);
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: newStatus }),
    });
    setStatusEditing(null);
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast('Status updated ✓', 'success');
    } else {
      toast('Update failed', 'error');
    }
  };

  const handleDelete = async (orderId: string) => {
    // Orders are never physically removed — "delete" labels the order as
    // deleted, keeps it in the history, and removes it from revenue.
    if (!confirm(`Delete order ${orderId}? It will stay in the history labeled "Deleted" and stop counting toward revenue.`)) return;
    setDeletingId(orderId);
    const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE', headers: await authHeaders() });
    setDeletingId(null);
    if (res.ok) {
      setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: 'deleted' } : o)));
      toast('Order marked as deleted', 'default');
    } else {
      toast('Delete failed', 'error');
    }
  };

  // ── Not logged in ────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 60 }}>
          <div className="empty-icon">📋</div>
          <div className="empty-title">Sign in to view orders</div>
          <div className="empty-sub">Your order history will appear here</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/auth/login')}>Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">📋 Orders</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => loadOrders()}>↻ Refresh</button>
        </div>
      </div>

      {/* Tab toggle — only sellers (business/supplier) get the "My Store" tab */}
      {isSeller && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="acct-type-toggle" style={{ maxWidth: 340 }}>
            <button className={`acct-type-btn ${activeTab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
              <span className="acct-type-icon">🛍️</span>
              <span className="acct-type-label">My Orders</span>
            </button>
            <button className={`acct-type-btn ${activeTab === 'store' ? 'active' : ''}`} onClick={() => setTab('store')}>
              <span className="acct-type-icon">🏪</span>
              <span className="acct-type-label">My Store</span>
            </button>
          </div>
        </div>
      )}

      <p className="page-subtitle">
        {loading
          ? 'Loading…'
          : activeTab === 'store'
            ? `${orders.length} order${orders.length !== 1 ? 's' : ''} received by your store`
            : `${orders.length} order${orders.length !== 1 ? 's' : ''} you placed`}
      </p>

      {loading ? (
        <div className="orders-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="order-card">
              <div className="skeleton" style={{ height: 16, width: '40%', borderRadius: 6, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 13, width: '60%', borderRadius: 6, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 13, width: '30%', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : error && orders.length === 0 ? (
        <ErrorState what="orders" onRetry={() => loadOrders()} />
      ) : orders.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-icon">{activeTab === 'store' ? '🏪' : '🛍️'}</div>
          <div className="empty-title">{activeTab === 'store' ? 'No orders received yet' : 'No orders found'}</div>
          <div className="empty-sub">{activeTab === 'store' ? 'Orders customers place for your products will appear here' : 'Your purchases will appear here'}</div>
          {activeTab === 'mine' && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/')}>Start Shopping</button>
          )}
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => {
            const status    = STATUS_MAP[order.status] ?? STATUS_MAP.pending;
            const isOpen    = expanded === order.id;
            const date      = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const itemCount = order.items.reduce((n, i) => n + i.qty, 0);
            const isBusy    = statusEditing === order.id || deletingId === order.id;

            return (
              <div key={order.id} className="order-card">
                {/* Header row */}
                <div className="order-card-top" onClick={() => setExpanded(isOpen ? null : order.id)} style={{ cursor: 'pointer' }}>
                  <div>
                    <div className="order-id">{order.id}</div>
                    <div className="order-date">
                      {date} · {itemCount} item{itemCount !== 1 ? 's' : ''} · {PAY_ICON[order.paymentMethod] ?? '💳'} {order.paymentMethod}
                      {activeTab === 'store' && order.customerName && <> · 👤 {order.customerName}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div className="order-total">${Number(order.total).toFixed(2)}</div>
                    <span className="order-status-badge" style={{ background: status.bg, color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Expanded items */}
                {isOpen && (
                  <div className="order-items-expand">
                    {order.items.map(item => {
                      const p = products.find(x => x.id === item.id);
                      return (
                        <div key={item.id} className="order-item-row">
                          <span className="order-item-icon">📦</span>
                          <span className="order-item-name">{p?.name ?? `Product #${item.id}`}</span>
                          <span className="order-item-qty">×{item.qty}</span>
                          <span className="order-item-price">${p ? (p.price * item.qty).toFixed(2) : '—'}</span>
                        </div>
                      );
                    })}
                    {order.discount > 0 && (
                      <div className="order-item-row" style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
                        <span style={{ flex: 1, paddingLeft: 30 }}>Discount</span>
                        <span>-${Number(order.discount).toFixed(2)}</span>
                      </div>
                    )}
                    {order.notes && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: '.8rem', color: 'var(--text-muted)' }}>
                        📝 {order.notes}
                      </div>
                    )}
                    <div className="order-expand-chevron" onClick={() => setExpanded(null)} style={{ cursor: 'pointer' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 15l-6-6-6 6"/>
                      </svg>
                      Collapse
                    </div>
                  </div>
                )}

                {/* Collapsed preview */}
                {!isOpen && (
                  <div className="order-items-preview" onClick={() => setExpanded(order.id)} style={{ cursor: 'pointer' }}>
                    {order.items.slice(0, 3).map(item => {
                      const p = products.find(x => x.id === item.id);
                      return (
                        <span key={item.id} className="order-preview-chip">
                          {p?.name ?? `#${item.id}`}
                        </span>
                      );
                    })}
                    {order.items.length > 3 && (
                      <span className="order-preview-chip more">+{order.items.length - 3} more</span>
                    )}
                  </div>
                )}

                {/* Track button */}
                <div style={{ padding: '2px 0 8px' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                    onClick={() => router.push(`/orders/${order.id}`)}
                  >
                    📍 Track Order
                  </button>
                </div>

                {/* CRUD actions — only the store managing its received orders.
                    Buyers (My Orders) can only track, not change status/delete. */}
                {activeTab === 'store' && (
                order.status === 'deleted' ? (
                  <div className="order-crud-row" style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                    🗑 Deleted — kept in history, not counted in revenue
                  </div>
                ) : (
                <div className="order-crud-row">
                  {/* Status change */}
                  <select
                    className="order-status-select"
                    value={order.status}
                    disabled={isBusy}
                    onChange={e => handleStatusChange(order.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{STATUS_MAP[s]?.label ?? s}</option>
                    ))}
                  </select>

                  {statusEditing === order.id && (
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Saving…</span>
                  )}

                  {/* Delete (soft) */}
                  <button
                    className="btn btn-ghost btn-sm crud-del-btn"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => handleDelete(order.id)}
                    disabled={isBusy}
                  >
                    {deletingId === order.id ? '…' : '🗑️ Delete'}
                  </button>
                </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
