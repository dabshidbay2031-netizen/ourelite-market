'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import ProductImage from '@/components/ProductImage';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useMyProductIds } from '@/lib/useMyProductIds';
import { CATEGORIES } from '@/lib/data';
import { enqueueOrder, getQueue, dequeueOrder } from '@/lib/offlineQueue';
import { useCashier } from '@/context/CashierContext';
import type { CartItem, PaymentMethod, PosSession } from '@/lib/types';

const Receipt = dynamic(() => import('@/components/Receipt'), { ssr: false });

/* ── Park/hold types ─────────────────────────────────────────── */
interface ParkedCart {
  id:      string;
  label:   string;
  savedAt: string;
  items:   CartItem[];
}

/* ── Payment split ───────────────────────────────────────────── */
interface Split {
  method: PaymentMethod;
  amount: string;
}

const PARK_KEY = 'mg_parked_carts';
function readParked(): ParkedCart[] {
  try { return JSON.parse(localStorage.getItem(PARK_KEY) ?? '[]'); } catch { return []; }
}
function writeParked(carts: ParkedCart[]) {
  try { localStorage.setItem(PARK_KEY, JSON.stringify(carts)); } catch { /* storage full */ }
}

/* ── Offline sync indicator ──────────────────────────────────── */
function OfflineBadge() {
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => setCount(getQueue().length), []);

  useEffect(() => {
    refresh();
    async function replay() {
      const q = getQueue();
      if (!q.length) return;
      setSyncing(true);
      for (const item of q) {
        try {
          const res = await fetch('/api/orders', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          });
          if (res.ok) dequeueOrder(item.localId);
        } catch { /* still offline */ }
      }
      setSyncing(false);
      refresh();
    }
    window.addEventListener('online', replay);
    return () => window.removeEventListener('online', replay);
  }, [refresh]);

  if (!count) return null;
  return (
    <span className="offline-sync-badge" title="Sales queued offline — will sync when back online">
      {syncing ? '↻' : '⚠'} {count} pending sync
    </span>
  );
}

export default function POSPage() {
  const { state, toast, reloadProducts, getStock } = useApp();
  const { user } = useAuth();
  const { cashier } = useCashier();
  const { products, suppliers, loading } = state;

  /* ── Session ─────────────────────────────────────────────────── */
  const [session, setSession] = useState<PosSession | null | 'loading'>('loading');
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [cashierName, setCashierName] = useState('');
  const [openingFloat, setOpeningFloat] = useState('0');
  const [openingSession, setOpeningSession] = useState(false);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingCounted, setClosingCounted] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closingSession, setClosingSession] = useState(false);
  const [sessionReport, setSessionReport] = useState<{
    totalOrders: number; totalRevenue: number; cashRevenue: number; expectedCash: number;
  } | null>(null);

  /* ── POS-local cart ──────────────────────────────────────────── */
  const [posCart, setPosCart] = useState<CartItem[]>([]);

  /* ── Park / hold ─────────────────────────────────────────────── */
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>([]);
  const [showParked, setShowParked] = useState(false);

  /* ── Checkout modal ──────────────────────────────────────────── */
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutName, setCheckoutName] = useState('Walk-in Customer');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [splits, setSplits] = useState<Split[]>([{ method: 'cash', amount: '' }]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [lastOrderId, setLastOrderId] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<{
    items: CartItem[]; name: string; subtotal: number; discount: number; total: number; method: string;
  } | null>(null);

  /* ── Product filter ──────────────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  /* ── Session timer ───────────────────────────────────────────── */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* ── Load session + parked carts on mount ────────────────────── */
  useEffect(() => {
    fetch('/api/pos-sessions?current=1')
      .then(r => r.json())
      .then(d => setSession(d || null))
      .catch(() => setSession(null));
    setParkedCarts(readParked());
  }, []);

  useEffect(() => {
    // Prefer cashier session name, then Supabase display name
    if (cashier?.name) setCashierName(cashier.name);
    else if (user?.displayName) setCashierName(user.displayName);
  }, [cashier, user]);

  /* ── Derived values ──────────────────────────────────────────── */
  // The store this register belongs to — the signed-in owner's supplier, or
  // the business a cashier logged into (cashier.businessId === owner auth id).
  const currentSupplier = useMemo(
    () => suppliers.find(s =>
      s.authUserId === user?.id ||
      (cashier ? s.authUserId === cashier.businessId : false)
    ) ?? null,
    [suppliers, user, cashier]
  );

  // This store's products (owned + claimed); the whole catalog for admins.
  const { ids: myIds, scoped: myScoped } = useMyProductIds();

  const filtered = useMemo(() => {
    // A register only ever shows its OWN store's products — never the whole
    // catalog (only an admin/non-store account, myScoped === false, sees all).
    let list = myScoped ? products.filter(p => myIds.has(p.id)) : products;
    if (activeCategory !== 'all')
      list = list.filter(p => p.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)  ||
        ((p as typeof p & { barcode?: string }).barcode ?? '').includes(q)
      );
    }
    return list;
  }, [products, search, activeCategory, myIds, myScoped]);

  const posTotal = useMemo(
    () => posCart.reduce((s, i) => s + (products.find(x => x.id === i.id)?.price ?? 0) * i.qty, 0),
    [posCart, products]
  );
  const posItemCount = posCart.reduce((s, i) => s + i.qty, 0);

  const sessionAge = useMemo(() => {
    if (!session || session === 'loading') return '';
    const ms = now - new Date(session.openedAt).getTime();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [session, now]);

  const splitTotal = useMemo(
    () => splits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0),
    [splits]
  );
  const changeDue = Math.max(0, splitTotal - posTotal);

  /* ── Session handlers ────────────────────────────────────────── */
  async function handleOpenSession() {
    if (!cashierName.trim()) { toast('Enter cashier name', 'error'); return; }
    setOpeningSession(true);
    try {
      const res = await fetch('/api/pos-sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openedBy:     user?.id ?? 'anonymous',
          cashierName:  cashierName.trim(),
          openingFloat: parseFloat(openingFloat) || 0,
        }),
      });
      if (res.ok) {
        setSession(await res.json());
        setShowOpenModal(false);
        toast('Register opened', 'success');
      } else {
        toast('Failed to open session', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
    setOpeningSession(false);
  }

  async function openCloseModal() {
    if (!session || session === 'loading') return;
    setClosingCounted('');
    setCloseNotes('');
    setSessionReport(null);
    setShowCloseModal(true);
    try {
      const res = await fetch(`/api/pos-sessions/${session.id}`);
      if (res.ok) {
        const d = await res.json();
        setSessionReport({
          totalOrders:  d.totalOrders,
          totalRevenue: d.totalRevenue,
          cashRevenue:  d.cashRevenue,
          expectedCash: d.expectedCash,
        });
      }
    } catch { /* show modal anyway */ }
  }

  async function handleCloseSession() {
    if (!session || session === 'loading') return;
    setClosingSession(true);
    try {
      const res = await fetch(`/api/pos-sessions/${session.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingCounted: parseFloat(closingCounted) || 0, notes: closeNotes }),
      });
      if (res.ok) {
        setSession(null);
        setShowCloseModal(false);
        setPosCart([]);
        toast('Register closed', 'success');
      } else {
        toast('Failed to close session', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
    setClosingSession(false);
  }

  /* ── Cart handlers ───────────────────────────────────────────── */
  function addToPos(productId: number) {
    const stock = getStock(productId);
    setPosCart(prev => {
      const existing = prev.find(i => i.id === productId);
      if (existing) {
        if (existing.qty >= stock) { toast(`Only ${stock} in stock`, 'warning'); return prev; }
        return prev.map(i => i.id === productId ? { ...i, qty: i.qty + 1 } : i);
      }
      if (stock <= 0) { toast('Out of stock', 'warning'); return prev; }
      return [...prev, { id: productId, qty: 1 }];
    });
  }

  function changeQty(productId: number, delta: number) {
    setPosCart(prev =>
      prev.map(i => i.id === productId ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
          .filter(i => i.qty > 0)
    );
  }

  /* ── Park / hold handlers ────────────────────────────────────── */
  function parkCart() {
    if (!posCart.length) return;
    const id    = Date.now().toString(36);
    const label = `Sale #${parkedCarts.length + 1} (${posItemCount} item${posItemCount !== 1 ? 's' : ''})`;
    const next  = [...parkedCarts, { id, label, savedAt: new Date().toISOString(), items: posCart }];
    setParkedCarts(next);
    writeParked(next);
    setPosCart([]);
    toast(`Cart parked — "${label}"`, 'default');
  }

  function recallCart(parkedId: string) {
    const parked = parkedCarts.find(c => c.id === parkedId);
    if (!parked) return;
    setPosCart(parked.items);
    const next = parkedCarts.filter(c => c.id !== parkedId);
    setParkedCarts(next);
    writeParked(next);
    setShowParked(false);
    toast('Cart recalled', 'success');
  }

  function deleteParked(parkedId: string) {
    const next = parkedCarts.filter(c => c.id !== parkedId);
    setParkedCarts(next);
    writeParked(next);
  }

  /* ── Checkout handlers ───────────────────────────────────────── */
  function openCheckout() {
    if (!posCart.length) return;
    setSplits([{ method: 'cash', amount: posTotal.toFixed(2) }]);
    setCheckoutName('Walk-in Customer');
    setCheckoutPhone('');
    setShowCheckout(true);
  }

  async function handlePlaceOrder() {
    if (placingOrder) return;
    if (splitTotal < posTotal - 0.01) {
      toast(`Still owed $${(posTotal - splitTotal).toFixed(2)} — add more payment`, 'error');
      return;
    }

    const payMethod = splits.length === 1
      ? splits[0].method
      : splits.map(s => s.method).join('+');

    const notesParts: string[] = [];
    if (splits.length > 1)
      notesParts.push(`Split: ${splits.map(s => `${s.method} $${s.amount}`).join(', ')}`);
    if (changeDue > 0.01)
      notesParts.push(`Change: $${changeDue.toFixed(2)}`);

    const orderPayload: Record<string, unknown> = {
      customerName:  checkoutName.trim() || 'Walk-in Customer',
      customerPhone: checkoutPhone.trim() || '',
      userId:        user?.id ?? null,
      items:         posCart.map(i => ({ id: i.id, qty: i.qty })),
      paymentMethod: payMethod,
      sessionId:     session && session !== 'loading' ? session.id   : null,
      cashierName:   session && session !== 'loading' ? session.cashierName : null,
      notes:         notesParts.length ? notesParts.join(' | ') : null,
    };

    setPlacingOrder(true);
    let order: { id: string; total: number } | null = null;
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      if (res.ok) {
        order = await res.json();
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.error ?? 'Order failed', 'error');
      }
    } catch {
      // Offline — queue for later sync
      const localId = enqueueOrder(orderPayload);
      toast(`Offline — sale queued (${localId.slice(0, 12)})`, 'warning');
      order = { id: localId, total: posTotal };
    }
    setPlacingOrder(false);

    if (order) {
      const snapshot = [...posCart];
      setLastOrderId(order.id);
      setReceiptData({
        items:    snapshot,
        name:     checkoutName.trim() || 'Walk-in Customer',
        subtotal: posTotal,
        discount: 0,
        total:    order.total,
        method:   payMethod,
      });
      setPosCart([]);
      setShowCheckout(false);
      setShowReceipt(true);
      reloadProducts();
    }
  }

  /* ── Render: loading ─────────────────────────────────────────── */
  if (session === 'loading') {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-light)' }}>Loading…</div>
      </div>
    );
  }

  /* ── Render: receipt ─────────────────────────────────────────── */
  if (showReceipt && receiptData) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <Receipt
          orderId={lastOrderId}
          businessName={currentSupplier?.name}
          businessIcon={currentSupplier?.icon}
          customerName={receiptData.name}
          paymentMethod={receiptData.method}
          items={receiptData.items}
          products={products}
          subtotal={receiptData.subtotal}
          discount={receiptData.discount}
          total={receiptData.total}
          onClose={() => { setShowReceipt(false); setReceiptData(null); }}
        />
        <div style={{ padding: '0 16px 80px' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => { setShowReceipt(false); setReceiptData(null); }}
          >
            ✚ New Sale
          </button>
        </div>
      </div>
    );
  }

  /* ── Render: no session → gate ───────────────────────────────── */
  if (session === null) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-icon">🖥️</div>
          <div className="empty-title">Register is closed</div>
          <div className="empty-sub">Open the register to start selling</div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowOpenModal(true)}>
            Open Register
          </button>
          <div style={{ marginTop: 12 }}><OfflineBadge /></div>
        </div>

        {showOpenModal && (
          <div className="modal-overlay" onClick={() => setShowOpenModal(false)}>
            <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                🖥️ Open Register
                <button className="modal-close" onClick={() => setShowOpenModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Cashier name</label>
                  <input className="form-input" value={cashierName} onChange={e => setCashierName(e.target.value)} placeholder="Your name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Opening cash float ($)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} placeholder="0.00" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowOpenModal(false)}>Cancel</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleOpenSession} disabled={openingSession}>
                    {openingSession ? 'Opening…' : 'Open Register'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Render: main POS ────────────────────────────────────────── */
  return (
    <div className="page-anim" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 68px)' }}>
      <Header showSearch={false} />

      {/* Session banner */}
      <div className="pos-session-banner">
        <span>🖥️ <strong>{session.cashierName}</strong> · {sessionAge} open</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <OfflineBadge />
          {parkedCarts.length > 0 && (
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
              onClick={() => setShowParked(true)}>
              ⏸ Held ({parkedCarts.length})
            </button>
          )}
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
            onClick={openCloseModal}>
            Close Register
          </button>
        </div>
      </div>

      <div className="page-title-bar">
        <span className="page-title">🖥️ Point of Sale</span>
        {currentSupplier && (
          <span className="pos-store-tag">🏪 {currentSupplier.name}</span>
        )}
      </div>

      <div className="pos-search-bar">
        <input className="pos-search-input" placeholder="Search by name, SKU or barcode…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="chips-row">
          <button className={`chip ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>All</button>
          {CATEGORIES.map(cat => (
            <button key={cat.id} className={`chip ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}>
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Inline cart summary */}
      {posCart.length > 0 && (
        <div className="pos-cart-bar">
          <div className="pos-cart-bar-items">
            {posCart.map(i => {
              const p = products.find(x => x.id === i.id);
              return (
                <div key={i.id} className="pos-cart-bar-item">
                  <span className="pos-cart-item-name">{p?.name ?? `#${i.id}`}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button className="pos-qty-btn" onClick={() => changeQty(i.id, -1)}>−</button>
                    <span style={{ minWidth: 18, textAlign: 'center' }}>{i.qty}</span>
                    <button className="pos-qty-btn" onClick={() => changeQty(i.id, 1)}>+</button>
                    <span className="pos-cart-item-total">${((p?.price ?? 0) * i.qty).toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pos-cart-bar-footer">
            <span className="pos-cart-total">${posTotal.toFixed(2)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-secondary" onClick={parkCart}>⏸ Park</button>
              <button className="btn btn-sm btn-primary" onClick={openCheckout}>Pay →</button>
            </div>
          </div>
        </div>
      )}

      {/* Product grid */}
      <div className="pos-products">
        {loading ? (
          <div className="pos-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="pos-item">
                <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 8 }} />
                <div className="skeleton" style={{ height: 12, width: '80%', borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 6 }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{search.trim() ? '🔍' : '🏪'}</div>
            <div className="empty-title">{search.trim() ? 'No products found' : 'No products in your store yet'}</div>
          </div>
        ) : (
          <div className="pos-grid">
            {filtered.map(p => {
              const stock  = getStock(p.id);
              const inCart = posCart.find(i => i.id === p.id)?.qty ?? 0;
              return (
                <div key={p.id} className={`pos-item${inCart > 0 ? ' pos-in-cart' : ''}`}
                  onClick={() => stock > 0 && addToPos(p.id)}
                  style={stock === 0 ? { opacity: 0.5, pointerEvents: 'none' } : {}}>
                  {inCart > 0 && <span className="pos-item-badge">{inCart}</span>}
                  <div className="pos-item-icon">
                    <ProductImage imageUrl={p.imageUrl} imageUrls={p.imageUrls} name={p.name} style={{ borderRadius: 8 }} />
                  </div>
                  <span className="pos-item-name">{p.name}</span>
                  <span className="pos-item-price">${p.price.toFixed(2)}</span>
                  <span className="pos-item-stock">{stock === 0 ? 'Out of stock' : `${stock} in stock`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Parked carts modal ── */}
      {showParked && (
        <div className="modal-overlay" onClick={() => setShowParked(false)}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              ⏸ Held Sales
              <button className="modal-close" onClick={() => setShowParked(false)}>✕</button>
            </div>
            <div className="modal-body">
              {parkedCarts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-light)', padding: '20px 0' }}>No held sales</div>
              ) : parkedCarts.map(c => (
                <div key={c.id} className="pos-parked-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.label}</div>
                    <div style={{ fontSize: '.8rem', color: 'var(--text-light)' }}>{new Date(c.savedAt).toLocaleTimeString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => recallCart(c.id)}>Recall</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => deleteParked(c.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout modal ── */}
      {showCheckout && (
        <div className="modal-overlay" onClick={() => setShowCheckout(false)}>
          <div className="modal-box pos-checkout-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              💳 Payment — ${posTotal.toFixed(2)}
              <button className="modal-close" onClick={() => setShowCheckout(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Cart summary */}
              <div className="pos-checkout-items">
                {posCart.map(i => {
                  const p = products.find(x => x.id === i.id);
                  return (
                    <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.88rem', marginBottom: 4 }}>
                      <span>{p?.name ?? `#${i.id}`} × {i.qty}</span>
                      <span>${((p?.price ?? 0) * i.qty).toFixed(2)}</span>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total</span><span>${posTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Customer */}
              <div className="form-group">
                <label className="form-label">Customer name</label>
                <input className="form-input" value={checkoutName} onChange={e => setCheckoutName(e.target.value)} placeholder="Walk-in Customer" />
              </div>

              {/* Payment splits */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '.9rem' }}>Payment</div>
                {splits.map((sp, idx) => (
                  <div key={idx} className="pos-split-row">
                    <select className="form-input" style={{ flex: '0 0 120px' }}
                      value={sp.method}
                      onChange={e => setSplits(prev => prev.map((s, i) => i === idx ? { ...s, method: e.target.value as PaymentMethod } : s))}>
                      <option value="cash">💵 Cash</option>
                      <option value="waafi">📱 Waafi</option>
                      <option value="card">💳 Card</option>
                    </select>
                    <input className="form-input" type="number" min="0" step="0.01"
                      value={sp.amount} placeholder="Amount" style={{ flex: 1 }}
                      onChange={e => setSplits(prev => prev.map((s, i) => i === idx ? { ...s, amount: e.target.value } : s))} />
                    {splits.length > 1 && (
                      <button className="btn btn-sm btn-secondary"
                        onClick={() => setSplits(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                    )}
                  </div>
                ))}

                {splits.length < 3 && (
                  <button className="btn btn-sm btn-secondary" style={{ marginTop: 4 }}
                    onClick={() => setSplits(prev => [...prev, {
                      method: 'cash',
                      amount: Math.max(0, posTotal - splitTotal).toFixed(2),
                    }])}>
                    + Split payment
                  </button>
                )}

                {changeDue > 0.01 && (
                  <div className="pos-change-display">
                    💵 Change due: <strong>${changeDue.toFixed(2)}</strong>
                  </div>
                )}
                {splitTotal > 0 && splitTotal < posTotal - 0.01 && (
                  <div className="pos-short-display">
                    Still owed: <strong>${(posTotal - splitTotal).toFixed(2)}</strong>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCheckout(false)}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }}
                  onClick={handlePlaceOrder}
                  disabled={placingOrder || splitTotal < posTotal - 0.01}>
                  {placingOrder ? 'Processing…' : `Charge $${posTotal.toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Close session modal ── */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              🏦 Close Register
              <button className="modal-close" onClick={() => setShowCloseModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {sessionReport ? (
                <div className="pos-zreport">
                  <div className="pos-zreport-row">
                    <span>Orders this session</span>
                    <strong>{sessionReport.totalOrders}</strong>
                  </div>
                  <div className="pos-zreport-row">
                    <span>Total revenue</span>
                    <strong>${sessionReport.totalRevenue.toFixed(2)}</strong>
                  </div>
                  <div className="pos-zreport-row">
                    <span>Cash sales</span>
                    <strong>${sessionReport.cashRevenue.toFixed(2)}</strong>
                  </div>
                  <div className="pos-zreport-row">
                    <span>Opening float</span>
                    <strong>${session.openingFloat.toFixed(2)}</strong>
                  </div>
                  <div className="pos-zreport-row pos-zreport-total">
                    <span>Expected in drawer</span>
                    <strong>${sessionReport.expectedCash.toFixed(2)}</strong>
                  </div>
                </div>
              ) : (
                <div className="skeleton" style={{ height: 130, borderRadius: 10, marginBottom: 16 }} />
              )}

              <div className="form-group">
                <label className="form-label">Count your cash drawer ($)</label>
                <input className="form-input" type="number" min="0" step="0.01"
                  value={closingCounted} onChange={e => setClosingCounted(e.target.value)} placeholder="0.00" />
              </div>

              {sessionReport && closingCounted !== '' && (() => {
                const counted  = parseFloat(closingCounted) || 0;
                const diff     = counted - sessionReport.expectedCash;
                const isOver   = diff >= 0;
                const diffAbs  = Math.abs(diff);
                return diffAbs > 0.01 ? (
                  <div className={`pos-discrepancy ${isOver ? 'pos-discrepancy-ok' : 'pos-discrepancy-warn'}`}>
                    {isOver ? `+$${diffAbs.toFixed(2)} over` : `-$${diffAbs.toFixed(2)} short`}
                  </div>
                ) : (
                  <div className="pos-discrepancy pos-discrepancy-ok">✓ Cash matches exactly</div>
                );
              })()}

              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="e.g. Smooth shift" />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCloseModal(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCloseSession} disabled={closingSession}>
                  {closingSession ? 'Closing…' : 'Close Register'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
