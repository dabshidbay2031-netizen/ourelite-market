'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import Receipt from '@/components/Receipt';
import type { PaymentMethod } from '@/lib/types';

interface Address {
  id: number; label: string; fullName: string;
  street: string; city: string; country: string; phone: string; isDefault: boolean;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { state, cartTotal, setPaymentMethod, setPaymentState, clearCart, adjustStock, toast } = useApp();
  const { user } = useAuth();
  const { cart, products, paymentMethod, paymentState } = state;
  const [lastOrderId,    setLastOrderId]    = useState('');
  const [showReceipt,    setShowReceipt]    = useState(false);
  const [receiptItems,   setReceiptItems]   = useState(state.cart);
  const [receiptSubtotal,setReceiptSubtotal]= useState(0);
  const [receiptDiscount,setReceiptDiscount]= useState(0);
  const [receiptTotal,   setReceiptTotal]   = useState(0);
  const [receiptName,    setReceiptName]    = useState('');

  // Customer info
  const [name,       setName]       = useState('');
  const [phone,      setPhone]      = useState('');
  const [waafiPhone, setWaafiPhone] = useState('');

  // Coupon
  const [couponCode,     setCouponCode]     = useState('');
  const [couponLoading,  setCouponLoading]  = useState(false);
  const [couponError,    setCouponError]    = useState('');
  const [couponSuccess,  setCouponSuccess]  = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [appliedCoupon,  setAppliedCoupon]  = useState<{ id: number; code: string } | null>(null);

  // Addresses
  const [addresses,        setAddresses]        = useState<Address[]>([]);
  const [selectedAddressId,setSelectedAddressId]= useState<number | null>(null);
  const [showAddressForm,  setShowAddressForm]  = useState(false);
  const [newAddr,          setNewAddr]          = useState({ label: 'Home', fullName: '', street: '', city: '', country: 'Somalia', phone: '' });

  const subtotal    = cartTotal();
  const discountAmt = couponDiscount;
  const total       = Math.max(0, subtotal - discountAmt);

  // Load saved addresses
  useEffect(() => {
    if (!user) return;
    fetch(`/api/addresses?userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAddresses(data);
          const def = data.find((a: Address) => a.isDefault);
          if (def) setSelectedAddressId(def.id);
        }
      })
      .catch(() => {});
  }, [user]);

  // Pre-fill name + phone from profile
  useEffect(() => {
    if (user?.displayName) setName(user.displayName);
    if (user?.phoneNumber) setPhone(user.phoneNumber);
  }, [user]);

  // Fill from selected address
  useEffect(() => {
    const addr = addresses.find(a => a.id === selectedAddressId);
    if (addr) {
      if (addr.fullName) setName(addr.fullName);
      if (addr.phone)    setPhone(addr.phone);
    }
  }, [selectedAddressId, addresses]);

  if (cart.length === 0 && paymentState !== 'success') {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 60 }}>
          <div className="empty-icon">🛒</div>
          <div className="empty-title">Cart is empty</div>
          <div className="empty-sub">Add products before checking out</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/')}>
            Browse Products
          </button>
        </div>
      </div>
    );
  }

  /* ── Coupon validation ─── */
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true); setCouponError(''); setCouponSuccess('');
    try {
      const res  = await fetch('/api/coupons/validate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code: couponCode.trim(), orderTotal: subtotal }),
      });
      const data = await res.json();
      if (data.valid) {
        setCouponDiscount(data.discountAmount);
        setAppliedCoupon(data.coupon);
        setCouponSuccess(data.message);
      } else {
        setCouponError(data.message);
        setCouponDiscount(0);
        setAppliedCoupon(null);
      }
    } catch {
      setCouponError('Failed to validate coupon');
    }
    setCouponLoading(false);
  };

  const removeCoupon = () => {
    setCouponCode(''); setCouponDiscount(0); setAppliedCoupon(null);
    setCouponError(''); setCouponSuccess('');
  };

  /* ── Save new address ─── */
  const handleSaveAddress = async () => {
    if (!newAddr.street || !newAddr.city || !user) return;
    const res = await fetch('/api/addresses', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...newAddr, userId: user.id, isDefault: addresses.length === 0 }),
    });
    if (res.ok) {
      const saved = await res.json();
      setAddresses(prev => [...prev, saved]);
      setSelectedAddressId(saved.id);
      setShowAddressForm(false);
      setNewAddr({ label: 'Home', fullName: '', street: '', city: '', country: 'Somalia', phone: '' });
    }
  };

  /* ── Payment ─── */
  const handlePayment = async () => {
    if (!name.trim()) { toast('Please enter your name', 'error'); return; }
    if (paymentMethod === 'waafi' && waafiPhone.length < 7) {
      toast('Please enter a valid Waafi number', 'error'); return;
    }
    setPaymentState('pending');
    await new Promise(r => setTimeout(r, 3500));
    cart.forEach(item => adjustStock(item.id, -item.qty));

    const orderNum = `ORD-${Date.now().toString().slice(-6)}`;
    setLastOrderId(orderNum);

    const selectedAddr = addresses.find(a => a.id === selectedAddressId);
    const deliveryAddr = selectedAddr
      ? `${selectedAddr.street}, ${selectedAddr.city}, ${selectedAddr.country}`
      : '';

    try {
      await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:            orderNum,
          customerName:  name,
          customerPhone: paymentMethod === 'waafi' ? `+252${waafiPhone}` : phone,
          userId:        user?.id ?? null,
          items:         cart,
          subtotal,
          discount:      discountAmt,
          total,
          paymentMethod,
          status:        'pending',
          notes:         [
            appliedCoupon ? `Coupon: ${appliedCoupon.code} (-$${discountAmt.toFixed(2)})` : '',
            deliveryAddr  ? `Deliver to: ${deliveryAddr}` : '',
          ].filter(Boolean).join(' | ') || null,
        }),
      });

      // Increment coupon usage
      if (appliedCoupon) {
        await fetch(`/api/coupons/${appliedCoupon.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ usedCount: 'increment' }),
        }).catch(() => {});
      }
    } catch { /* non-fatal */ }

    // Snapshot cart data before clearing for receipt
    setReceiptItems([...cart]);
    setReceiptSubtotal(subtotal);
    setReceiptDiscount(discountAmt);
    setReceiptTotal(total);
    setReceiptName(name);

    clearCart();
    setPaymentState('success');
    toast('Payment successful! 🎉', 'success');
  };

  if (paymentState === 'pending') {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="payment-pending">
          <div className="spinner" />
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Processing Payment…</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '.88rem' }}>
            {paymentMethod === 'waafi' ? 'Waiting for Waafi confirmation' : 'Please wait…'}
          </div>
        </div>
      </div>
    );
  }

  // Find the supplier for the receipt (if user is a supplier)
  const currentSupplier = state.suppliers.find(s => s.authUserId === user?.id);

  if (paymentState === 'success') {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="payment-success">
          <div className="success-icon">✅</div>
          <div className="success-title">Payment Successful!</div>
          <div className="success-subtitle">Your order has been placed</div>
          <div className="success-order-box">
            <div className="success-order-id">{lastOrderId || 'Order Confirmed'}</div>
            <div className="success-order-total">Total paid: <strong>${receiptTotal.toFixed(2)}</strong></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => setShowReceipt(true)}
            >
              🖨️ Print Receipt
            </button>
            {user && (
              <button className="btn btn-outline btn-lg" onClick={() => { setPaymentState('idle'); router.push(`/orders/${lastOrderId}`); }}>
                📍 Track Order
              </button>
            )}
            <button className="btn btn-primary btn-lg" onClick={() => { setPaymentState('idle'); router.push('/'); }}>
              Continue Shopping
            </button>
          </div>
        </div>

        {showReceipt && (
          <Receipt
            orderId={lastOrderId}
            businessName={currentSupplier?.name}
            businessIcon={currentSupplier?.icon}
            customerName={receiptName}
            paymentMethod={paymentMethod}
            items={receiptItems}
            products={state.products}
            subtotal={receiptSubtotal}
            discount={receiptDiscount}
            total={receiptTotal}
            onClose={() => setShowReceipt(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="page-anim">
      <Header showSearch={false} />
      <div className="checkout-wrap">

        {/* Order Summary */}
        <div className="checkout-section">
          <div className="checkout-section-title">Order Summary</div>
          <div className="order-items-list">
            {cart.map(item => {
              const p = products.find(x => x.id === item.id);
              if (!p) return null;
              return (
                <div key={item.id} className="checkout-item">
                  <div className="checkout-item-icon">{p.icon}</div>
                  <div className="checkout-item-info">
                    <div className="checkout-item-name">{p.name}</div>
                    <div className="checkout-item-qty">Qty: {item.qty}</div>
                  </div>
                  <div className="checkout-item-price">${(p.price * item.qty).toFixed(2)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coupon */}
        <div className="checkout-section">
          <div className="checkout-section-title">🎟️ Coupon Code</div>
          {appliedCoupon ? (
            <div className="coupon-applied-row">
              <div>
                <div className="coupon-applied-code">✓ {appliedCoupon.code}</div>
                <div className="coupon-applied-savings">{couponSuccess} — saved ${discountAmt.toFixed(2)}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={removeCoupon} style={{ color: 'var(--danger)' }}>Remove</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="Enter coupon code…"
                value={couponCode}
                onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); setCouponSuccess(''); }}
                onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}>
                {couponLoading ? '…' : 'Apply'}
              </button>
            </div>
          )}
          {couponError   && <div className="auth-error"   style={{ marginTop: 8 }}>{couponError}</div>}
        </div>

        {/* Summary */}
        <div className="checkout-section">
          <div className="summary-box">
            <div className="summary-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            {discountAmt > 0 && (
              <div className="summary-row discount">
                <span>Coupon ({appliedCoupon?.code})</span>
                <span>-${discountAmt.toFixed(2)}</span>
              </div>
            )}
            <div className="summary-row total"><span>Total</span><span>${total.toFixed(2)}</span></div>
          </div>
        </div>

        {/* Delivery address */}
        {user && (
          <div className="checkout-section">
            <div className="checkout-section-title">📍 Delivery Address</div>
            {addresses.length > 0 && (
              <div className="addr-list">
                {addresses.map(addr => (
                  <button
                    key={addr.id}
                    className={`addr-card${selectedAddressId === addr.id ? ' selected' : ''}`}
                    onClick={() => setSelectedAddressId(addr.id)}
                  >
                    <div className="addr-label">{addr.label}</div>
                    <div className="addr-text">{addr.street}, {addr.city}, {addr.country}</div>
                    {addr.phone && <div className="addr-phone">📞 {addr.phone}</div>}
                  </button>
                ))}
              </div>
            )}
            {!showAddressForm ? (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAddressForm(true)}>
                + Add New Address
              </button>
            ) : (
              <div className="addr-form">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="form-group">
                    <label className="form-label">Label</label>
                    <select className="form-input" value={newAddr.label} onChange={e => setNewAddr(p => ({ ...p, label: e.target.value }))}>
                      <option>Home</option><option>Work</option><option>Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input className="form-input" placeholder="Your name" value={newAddr.fullName} onChange={e => setNewAddr(p => ({ ...p, fullName: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Street / District *</label>
                  <input className="form-input" placeholder="e.g. Hodan District, KM5 Road" value={newAddr.street} onChange={e => setNewAddr(p => ({ ...p, street: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="form-group">
                    <label className="form-label">City *</label>
                    <input className="form-input" placeholder="Mogadishu" value={newAddr.city} onChange={e => setNewAddr(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Country</label>
                    <input className="form-input" value={newAddr.country} onChange={e => setNewAddr(p => ({ ...p, country: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" placeholder="+252 61 XXX XXXX" value={newAddr.phone} onChange={e => setNewAddr(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveAddress} disabled={!newAddr.street || !newAddr.city}>Save Address</button>
                  <button className="btn btn-ghost" onClick={() => setShowAddressForm(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Customer Info */}
        <div className="checkout-section">
          <div className="checkout-section-title">Customer Info</div>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} />
          </div>
          {paymentMethod !== 'waafi' && (
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input className="form-input" placeholder="+252 XX XXX XXXX" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div className="checkout-section">
          <div className="checkout-section-title">Payment Method</div>
          <div className="payment-methods">
            {(['waafi', 'cash', 'card'] as PaymentMethod[]).map(m => (
              <button key={m} className={`pay-method-btn ${paymentMethod === m ? 'active' : ''}`} onClick={() => setPaymentMethod(m)}>
                <span className="pay-method-icon">{m === 'waafi' ? '📱' : m === 'cash' ? '💵' : '💳'}</span>
                {m === 'waafi' ? 'Waafi Pay' : m === 'cash' ? 'Cash' : 'Card'}
              </button>
            ))}
          </div>

          {paymentMethod === 'waafi' && (
            <div className="waafi-box">
              <div className="waafi-logo">WAAFI</div>
              <div className="waafi-sub">Fast & secure mobile payments</div>
              <div className="waafi-amount">${total.toFixed(2)}</div>
              <div className="waafi-amount-lbl">Amount to pay</div>
              <div className="waafi-input-wrap">
                <span className="waafi-prefix">+252</span>
                <input
                  className="waafi-phone"
                  placeholder="61 XXX XXXX"
                  value={waafiPhone}
                  onChange={e => setWaafiPhone(e.target.value.replace(/\D/g, ''))}
                  maxLength={9}
                />
              </div>
              <button className="waafi-pay-btn" onClick={handlePayment}>📱 Pay with Waafi</button>
            </div>
          )}

          {paymentMethod === 'cash' && (
            <button className="btn btn-success btn-full btn-lg" onClick={handlePayment}>
              💵 Confirm Cash Payment — ${total.toFixed(2)}
            </button>
          )}

          {paymentMethod === 'card' && (
            <div>
              <div className="form-group">
                <label className="form-label">Card Number</label>
                <input className="form-input" placeholder="0000 0000 0000 0000" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Expiry</label>
                  <input className="form-input" placeholder="MM/YY" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CVV</label>
                  <input className="form-input" placeholder="000" />
                </div>
              </div>
              <button className="btn btn-primary btn-full btn-lg" onClick={handlePayment}>
                💳 Pay ${total.toFixed(2)}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
