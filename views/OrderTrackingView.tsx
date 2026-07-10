'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from '@/lib/hashRouter';
import Header from '@/components/Header';
import { authHeaders } from '@/lib/clientAuth';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';

interface OrderItem { id: number; qty: number; }
interface Order {
  id: string; customerName: string; customerPhone: string;
  items: OrderItem[]; subtotal: number; discount: number; total: number;
  paymentMethod: string; status: string; notes?: string; createdAt: string;
  /** Server-set: the viewer isn't the buyer/seller — customer PII is hidden. */
  masked?: boolean;
}

const TIMELINE: { key: string; label: string; icon: string; description: string }[] = [
  { key: 'pending',    label: 'Order Placed',   icon: '📋', description: 'Your order has been received' },
  { key: 'processing', label: 'Processing',     icon: '⚙️', description: 'We are preparing your order' },
  { key: 'shipped',    label: 'Shipped',         icon: '🚚', description: 'Your order is on the way' },
  { key: 'completed',  label: 'Delivered',       icon: '✅', description: 'Order delivered successfully' },
];

const CANCELLED: { key: string; label: string; icon: string; description: string } =
  { key: 'cancelled', label: 'Cancelled', icon: '❌', description: 'This order has been cancelled' };

const STATUS_ORDER: Record<string, number> = {
  pending: 0, processing: 1, shipped: 2, completed: 3, cancelled: -1
};

const PAY_ICON: Record<string, string> = { waafi: '📱', cash: '💵', card: '💳', bulk: '📦' };

export default function OrderTrackingPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const { state, toast } = useApp();
  const { accountType, currentSupplier } = useAuth();
  const { products } = state;
  const [order,           setOrder]           = useState<Order | null>(null);
  // Products THIS store actually sells (owned in the catalog + claimed via
  // business_products). Used to tell whether the signed-in business is the
  // SELLER of this order or merely the buyer who placed it.
  const [mySoldIds,       setMySoldIds]       = useState<Set<number>>(new Set());
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refunding,       setRefunding]       = useState(false);
  const [updating,        setUpdating]        = useState(false);

  /* Move the order to a new status (business stage workflow). */
  async function setStatus(next: string, successMsg: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${params.id}`, {
        method: 'PATCH', headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setOrder(prev => prev ? { ...prev, status: next } : prev);
        toast(successMsg, 'success');
      } else {
        const e = await res.json().catch(() => null);
        toast(e?.error ?? 'Could not update the order', 'error');
      }
    } catch {
      toast('Network error — order not updated', 'error');
    }
    setUpdating(false);
  }

  useEffect(() => {
    // Send the JWT so the buyer/seller sees full customer info; a stranger
    // scanning a receipt QR gets the same order with the PII masked.
    (async () => {
      try {
        const res = await fetch(`/api/orders/${params.id}`, { headers: await authHeaders() });
        const d   = await res.json();
        if (d.error) setError(d.error);
        else setOrder(d);
      } catch {
        setError('Failed to load order');
      }
      setLoading(false);
    })();
  }, [params.id]);

  /* Resolve which products this store sells (owned + claimed). */
  useEffect(() => {
    if (!currentSupplier) { setMySoldIds(new Set()); return; }
    const owned = products.filter(p => p.supplierId === currentSupplier.id).map(p => p.id);
    let cancelled = false;
    fetch(`/api/business-products?supplierId=${currentSupplier.id}`)
      .then(r => r.json())
      .then((bp) => {
        if (cancelled) return;
        const claimed = Array.isArray(bp) ? bp.map((x: { productId: number }) => x.productId) : [];
        setMySoldIds(new Set<number>([...owned, ...claimed]));
      })
      .catch(() => { if (!cancelled) setMySoldIds(new Set<number>(owned)); });
    return () => { cancelled = true; };
  }, [currentSupplier, products]);

  if (loading) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div style={{ padding: 20 }}>
          <div className="skeleton" style={{ height: 180, borderRadius: 14, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 14, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-icon">❓</div>
          <div className="empty-title">Order not found</div>
          <div className="empty-sub">{error || `Order ${params.id} does not exist`}</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/orders')}>
            View All Orders
          </button>
        </div>
      </div>
    );
  }

  const isCancelled  = order.status === 'cancelled';
  const isDeleted    = order.status === 'deleted';
  const isRefunded   = order.status === 'refunded';
  // Seller controls only when THIS store actually sells something in the order.
  // A business viewing an order it merely placed (as a buyer) is not the seller.
  const isSeller     = order.items.some(it => mySoldIds.has(it.id));
  const canRefund    = accountType === 'business' && isSeller && !isCancelled && !isDeleted && !isRefunded;

  async function handleRefund() {
    setRefunding(true);
    try {
      const res = await fetch(`/api/orders/${params.id}`, {
        method: 'PATCH', headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'refunded' }),
      });
      if (res.ok) {
        setOrder(prev => prev ? { ...prev, status: 'refunded' } : prev);
        setShowRefundModal(false);
        toast('Order marked as refunded', 'success');
      } else {
        toast('Failed to issue refund', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
    setRefunding(false);
  }
  const currentStep  = STATUS_ORDER[order.status] ?? 0;
  // Business stage workflow: pending → processing → shipped → delivered
  const STAGE_KEYS   = ['pending', 'processing', 'shipped', 'completed'];
  const STAGE_LABEL: Record<string, string> = { processing: 'Processing', shipped: 'Shipped', completed: 'Delivered' };
  const nextKey      = currentStep >= 0 && currentStep < 3 ? STAGE_KEYS[currentStep + 1] : null;
  const nextLabel    = nextKey ? STAGE_LABEL[nextKey] : '';
  const canManage    = accountType === 'business' && isSeller && !isCancelled && !isDeleted && !isRefunded;
  const timeline     = isCancelled ? [TIMELINE[0], CANCELLED] : TIMELINE;
  const date         = new Date(order.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  const itemCount    = order.items.reduce((n, i) => n + i.qty, 0);
  const estimatedDays= isCancelled || isDeleted ? null : currentStep >= 3 ? 0 : (3 - currentStep) * 2 + 1;

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      {/* Back button */}
      <div style={{ padding: '8px 16px 0' }}>
        <button className="auth-back-btn" onClick={() => router.push('/orders')}>
          ← Back to Orders
        </button>
      </div>

      {/* Order Hero */}
      <div className="tracking-hero">
        <div className="tracking-order-id">{order.id}</div>
        <div className="tracking-date">{date}</div>
        {estimatedDays !== null && estimatedDays > 0 && (
          <div className="tracking-eta">
            🕐 Estimated delivery in <strong>{estimatedDays}–{estimatedDays + 2} days</strong>
          </div>
        )}
        {currentStep >= 3 && !isCancelled && (
          <div className="tracking-eta" style={{ background: '#d1fae5', color: '#059669' }}>
            ✅ Delivered successfully
          </div>
        )}
        {isCancelled && (
          <div className="tracking-eta" style={{ background: '#fee2e2', color: '#dc2626' }}>
            ❌ This order was cancelled
          </div>
        )}
        {isDeleted && (
          <div className="tracking-eta" style={{ background: '#f3f4f6', color: '#6b7280' }}>
            🗑 This order was deleted by the store — kept for record only, not counted in revenue
          </div>
        )}
        {isRefunded && (
          <div className="tracking-eta" style={{ background: '#ede9fe', color: '#7c3aed' }}>
            ↩ This order has been refunded — excluded from revenue
          </div>
        )}
        {canRefund && (
          <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: '.85rem' }}
            onClick={() => setShowRefundModal(true)}>
            ↩ Issue Refund
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="tracking-timeline-card">
        <div className="tracking-section-title">Order Status</div>
        <div className="tracking-timeline">
          {timeline.map((step, idx) => {
            const isDone    = isCancelled
              ? step.key === 'pending' || step.key === 'cancelled'
              : STATUS_ORDER[step.key] <= currentStep;
            const isCurrent = isCancelled
              ? step.key === 'cancelled'
              : step.key === order.status;
            return (
              <div key={step.key} className={`tracking-step${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
                <div className="tracking-step-dot">
                  {isDone ? <span style={{ fontSize: '.9rem' }}>{step.icon}</span> : <span className="tracking-dot-inner" />}
                </div>
                {idx < timeline.length - 1 && (
                  <div className={`tracking-line${isDone ? ' done' : ''}`} />
                )}
                <div className="tracking-step-info">
                  <div className="tracking-step-label">{step.label}</div>
                  <div className="tracking-step-desc">{step.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Business stage management */}
      {canManage && (
        <div className="tracking-section-card">
          <div className="tracking-section-title">⚡ Manage Order</div>
          <div className="tracking-stage-actions">
            {nextKey ? (
              <button
                className="btn btn-primary btn-full btn-lg"
                disabled={updating}
                onClick={() => setStatus(nextKey, `Order marked as ${nextLabel}`)}
              >
                {updating ? 'Updating…' : `Advance to ${nextLabel} →`}
              </button>
            ) : (
              <div className="tracking-stage-complete">✅ Order delivered — fully fulfilled</div>
            )}
            <button
              className="btn btn-outline btn-full"
              disabled={updating}
              onClick={() => { if (confirm(`Cancel order ${order.id}? This cannot be undone.`)) setStatus('cancelled', 'Order cancelled'); }}
            >
              Cancel Order
            </button>
          </div>
        </div>
      )}

      {/* Order Items */}
      <div className="tracking-section-card">
        <div className="tracking-section-title">
          Items ({itemCount})
        </div>
        {order.items.map(item => {
          const p = products.find(x => x.id === item.id);
          return (
            <div key={item.id} className="tracking-item-row">
              <span className="tracking-item-icon">📦</span>
              <div className="tracking-item-info">
                <div className="tracking-item-name">{p?.name ?? `Product #${item.id}`}</div>
                <div className="tracking-item-qty">Qty: {item.qty}</div>
              </div>
              <div className="tracking-item-price">
                ${p ? (p.price * item.qty).toFixed(2) : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment Summary */}
      <div className="tracking-section-card">
        <div className="tracking-section-title">Payment</div>
        <div className="tracking-summary-row">
          <span>Subtotal</span>
          <span>${Number(order.subtotal).toFixed(2)}</span>
        </div>
        {order.discount > 0 && (
          <div className="tracking-summary-row" style={{ color: 'var(--success)' }}>
            <span>Discount</span>
            <span>-${Number(order.discount).toFixed(2)}</span>
          </div>
        )}
        <div className="tracking-summary-row total">
          <span>Total Paid</span>
          <span>${Number(order.total).toFixed(2)}</span>
        </div>
        <div className="tracking-pay-method">
          {PAY_ICON[order.paymentMethod] ?? '💳'} {order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)} Payment
          {!order.masked && order.customerPhone && <span> · {order.customerPhone}</span>}
        </div>
        {order.notes && (
          <div className="tracking-notes">📝 {order.notes}</div>
        )}
      </div>

      {/* Refund modal */}
      {showRefundModal && (
        <div className="modal-overlay" onClick={() => setShowRefundModal(false)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              ↩ Issue Refund
              <button className="modal-close" onClick={() => setShowRefundModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'var(--text-light)', lineHeight: 1.5 }}>
                This will mark order <strong>{order.id}</strong> as refunded (<strong>${Number(order.total).toFixed(2)}</strong>).
                The order stays in history and is excluded from all revenue figures.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRefundModal(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1, background: '#7c3aed', borderColor: '#7c3aed' }}
                  onClick={handleRefund} disabled={refunding}>
                  {refunding ? 'Processing…' : 'Confirm Refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Info — hidden on the public (scanned-QR) view */}
      {order.masked ? (
        <div className="tracking-section-card" style={{ marginBottom: 100 }}>
          <div className="tracking-section-title">Customer</div>
          <div className="tracking-customer-row" style={{ color: 'var(--text-muted)' }}>
            <span>🔒</span>
            <span>Customer details are private — sign in as the buyer or the store to see them.</span>
          </div>
        </div>
      ) : (
        <div className="tracking-section-card" style={{ marginBottom: 100 }}>
          <div className="tracking-section-title">Customer</div>
          <div className="tracking-customer-row">
            <span>👤</span>
            <span>{order.customerName}</span>
          </div>
          {order.customerPhone && (
            <div className="tracking-customer-row">
              <span>📞</span>
              <a href={`tel:${order.customerPhone}`} style={{ color: 'var(--primary)' }}>
                {order.customerPhone}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
