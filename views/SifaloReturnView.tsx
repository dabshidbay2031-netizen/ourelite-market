'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, Link } from '@/lib/hashRouter';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';

/**
 * Landing page Sifalo Pay redirects the customer back to after hosted checkout
 * (return_url = …/payment/sifalo/return?order_id=<ref>, Sifalo appends &sid=…).
 *
 * We VERIFY the transaction server-side, and only then place the order from the
 * checkout payload stashed in localStorage before the redirect — so an
 * abandoned or failed payment never creates an order or touches stock.
 */
type Phase = 'verifying' | 'success' | 'failed';

interface Pending {
  ref:          string;
  name:         string;
  phone:        string;
  items:        { id: number; qty: number }[];
  couponCode:   string | null;
  deliveryNote: string | null;
  userId:       string | null;
}

const PENDING_KEY = 'mg_sifalo_pending';

export default function SifaloReturnView() {
  const router = useRouter();
  const params = useSearchParams();
  const { clearCart, reloadProducts } = useApp();
  const { user } = useAuth();

  const [phase, setPhase]   = useState<Phase>('verifying');
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;   // run the finalize exactly once
    ran.current = true;

    const sid = params.get('sid') || '';
    const ref = params.get('order_id') || '';

    let pending: Pending | null = null;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) pending = JSON.parse(raw) as Pending;
    } catch { /* ignore */ }

    if (!sid || !pending) {
      setPhase('failed');
      setMessage(!sid ? 'No transaction reference returned by Sifalo.' : 'Your checkout session expired.');
      return;
    }

    (async () => {
      // 1. Verify (poll while pending)
      let status = 'pending';
      for (let i = 0; i < 6 && status === 'pending'; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 2500));
        try {
          const vr = await fetch('/api/payments/sifalo/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid, orderId: ref }),
          });
          const v = await vr.json();
          status = v.status;
        } catch { status = 'failed'; }
      }

      if (status !== 'success') {
        setPhase('failed');
        setMessage(status === 'pending'
          ? 'Payment is still pending. If you were charged, your order will appear shortly.'
          : 'Payment was not completed.');
        return;
      }

      // 2. Payment confirmed → place the order (server prices + decrements stock)
      const notes = [pending.deliveryNote, `Sifalo SID: ${sid}`].filter(Boolean).join(' | ') || null;
      try {
        const res = await fetch('/api/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName:  pending.name,
            customerPhone: pending.phone,
            userId:        pending.userId ?? user?.id ?? null,
            items:         pending.items,
            paymentMethod: 'sifalo',
            couponCode:    pending.couponCode,
            notes,
          }),
        });
        if (!res.ok) throw new Error('order failed');
        const order = await res.json();
        localStorage.removeItem(PENDING_KEY);
        clearCart();
        reloadProducts().catch(() => {});
        setOrderId(order.id);
        setPhase('success');
      } catch {
        // Paid but order couldn't be recorded — surface the sid so support can reconcile.
        setPhase('failed');
        setMessage(`Payment succeeded (ref ${sid}) but we couldn't record the order. Please contact support with this reference.`);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-anim">
      <Header showSearch={false} />
      <div className="payment-success" style={{ textAlign: 'center' }}>
        {phase === 'verifying' && (
          <>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div className="success-title">Confirming your payment…</div>
            <div className="success-subtitle">Verifying with Sifalo Pay</div>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="success-icon" aria-hidden="true">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 5-6"/>
              </svg>
            </div>
            <div className="success-title">Payment Successful!</div>
            <div className="success-subtitle">Your order has been placed</div>
            <div className="success-order-box">
              <div className="success-order-id">{orderId || 'Order Confirmed'}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {orderId && <Link href={`/orders/${orderId}`} className="btn btn-outline btn-lg">Track Order</Link>}
              <button className="btn btn-primary btn-lg" onClick={() => router.push('/')}>Continue Shopping</button>
            </div>
          </>
        )}

        {phase === 'failed' && (
          <>
            <div className="success-icon" aria-hidden="true">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
              </svg>
            </div>
            <div className="success-title">Payment not completed</div>
            <div className="success-subtitle" style={{ maxWidth: 340, margin: '0 auto' }}>{message}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary btn-lg" onClick={() => router.push('/checkout')}>Back to Checkout</button>
              <button className="btn btn-outline btn-lg" onClick={() => router.push('/')}>Continue Shopping</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
