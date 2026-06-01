'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';

interface OrderItem { id: number; qty: number; }
interface Order {
  id: string; customerName: string; customerPhone: string;
  items: OrderItem[]; subtotal: number; discount: number; total: number;
  paymentMethod: string; status: string; notes?: string; createdAt: string;
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

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const router  = useRouter();
  const { state } = useApp();
  const { products } = state;
  const [order,   setOrder]   = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch(`/api/orders/${params.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setOrder(d);
      })
      .catch(() => setError('Failed to load order'))
      .finally(() => setLoading(false));
  }, [params.id]);

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
  const currentStep  = STATUS_ORDER[order.status] ?? 0;
  const timeline     = isCancelled ? [TIMELINE[0], CANCELLED] : TIMELINE;
  const date         = new Date(order.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  const itemCount    = order.items.reduce((n, i) => n + i.qty, 0);
  const estimatedDays= isCancelled ? null : currentStep >= 3 ? 0 : (3 - currentStep) * 2 + 1;

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

      {/* Order Items */}
      <div className="tracking-section-card">
        <div className="tracking-section-title">
          Items ({itemCount})
        </div>
        {order.items.map(item => {
          const p = products.find(x => x.id === item.id);
          return (
            <div key={item.id} className="tracking-item-row">
              <span className="tracking-item-icon">{p?.icon ?? '📦'}</span>
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
          {order.customerPhone && <span> · {order.customerPhone}</span>}
        </div>
        {order.notes && (
          <div className="tracking-notes">📝 {order.notes}</div>
        )}
      </div>

      {/* Customer Info */}
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
    </div>
  );
}
