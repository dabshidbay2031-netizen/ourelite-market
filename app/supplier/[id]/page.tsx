'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { getCategoryColor, hexToRgba } from '@/lib/data';
import ProductCard from '@/components/ProductCard';
import { getSupabase } from '@/lib/supabase';

interface Props {
  params: { id: string };
}

interface BulkItem { productId: number; qty: number; }

export default function SupplierProfilePage({ params }: Props) {
  const router  = useRouter();
  const { state, addToCart, toggleWishlist } = useApp();
  const wishlistSet  = useMemo(() => new Set(state.wishlist),    [state.wishlist]);
  const inventoryMap = useMemo(() =>
    new Map(state.inventory.map(i => [i.id, i.stock])),
  [state.inventory]);
  const { currentSupplier, user } = useAuth();
  const { products, suppliers, loading } = state;

  const supplierId = parseInt(params.id, 10);
  const supplier   = suppliers.find(s => s.id === supplierId);

  const supplierProducts = useMemo(
    () => products.filter(p => p.supplierId === supplierId),
    [products, supplierId]
  );

  const supplierCategories = useMemo(
    () => Array.from(new Set(supplierProducts.map(p => p.category))),
    [supplierProducts]
  );

  const isOwner = currentSupplier?.id === supplierId;

  // ── Bulk order modal state ──────────────────────────────
  const [showBulk, setShowBulk]     = useState(false);
  const [bulkItems, setBulkItems]   = useState<BulkItem[]>([{ productId: 0, qty: 1 }]);
  const [bulkName, setBulkName]     = useState('');
  const [bulkPhone, setBulkPhone]   = useState('');
  const [bulkNotes, setBulkNotes]   = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSent, setBulkSent]     = useState(false);

  const addBulkRow    = () => setBulkItems(r => [...r, { productId: 0, qty: 1 }]);
  const removeBulkRow = (i: number) => setBulkItems(r => r.filter((_, j) => j !== i));
  const updateBulkRow = (i: number, key: keyof BulkItem, val: number) =>
    setBulkItems(r => r.map((x, j) => j === i ? { ...x, [key]: val } : x));

  const handleBulkSubmit = async () => {
    if (!bulkName.trim()) return;
    const validItems = bulkItems.filter(r => r.productId > 0 && r.qty > 0);
    if (validItems.length === 0) return;
    setBulkLoading(true);

    const subtotal = validItems.reduce((s, r) => {
      const p = products.find(x => x.id === r.productId);
      return s + (p ? p.price * r.qty : 0);
    }, 0);

    try {
      let token: string | undefined;
      if (user) {
        const { data: { session } } = await getSupabase().auth.getSession();
        token = session?.access_token;
      }
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          id: `BULK-${Date.now().toString().slice(-6)}`,
          customerName: bulkName,
          customerPhone: bulkPhone,
          userId: user?.id ?? null,
          items: validItems.map(r => ({ id: r.productId, qty: r.qty })),
          subtotal,
          discount: 0,
          total: subtotal,
          paymentMethod: 'bulk',
          status: 'bulk_pending',
          notes: `Bulk order for ${supplier?.name ?? 'supplier'}. ${bulkNotes}`,
        }),
      });
      setBulkSent(true);
    } catch { /* non-fatal */ }

    setBulkLoading(false);
  };

  // ── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-anim profile-wrap">
        <div className="profile-hero" style={{ background: 'var(--surface)' }}>
          <button className="profile-back" onClick={() => router.back()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 18, width: 160, borderRadius: 6, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 13, width: 110, borderRadius: 6 }} />
        </div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <div className="empty-icon">🔍</div>
        <div className="empty-title">Business not found</div>
        <button className="btn btn-primary" onClick={() => router.back()}>Go Back</button>
      </div>
    );
  }

  const heroColor = getCategoryColor(supplierCategories[0] ?? 'default');
  const heroBg    = `linear-gradient(135deg, ${hexToRgba(heroColor, 0.15)}, ${hexToRgba(heroColor, 0.07)})`;

  return (
    <div className="page-anim profile-wrap">
      {/* Hero */}
      <div className="profile-hero" style={{ background: heroBg }}>
        <button className="profile-back" onClick={() => router.back()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>

        {isOwner && (
          <button className="profile-edit-btn btn btn-outline btn-sm" onClick={() => router.push('/profile')}>
            Edit Profile
          </button>
        )}

        <div className="profile-avatar">{supplier.icon}</div>
        <div className="profile-name">{supplier.name}</div>
        {supplier.location && (
          <div className="profile-loc"><span>📍</span> {supplier.location}</div>
        )}

        <div className="profile-badges">
          {supplier.verified && (
            <span className="sup-badge verified">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight:3 }}>
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Verified Business
            </span>
          )}
          {supplier.badge && <span className="sup-badge custom">{supplier.badge}</span>}
        </div>

        {supplier.bio && <p className="profile-bio">{supplier.bio}</p>}
      </div>

      {/* Stats */}
      <div style={{ padding: '0 16px 12px' }}>
        <div className="supplier-stats" style={{ marginTop: 0 }}>
          <div className="sup-stat">
            <div className="sup-stat-val">⭐ {supplier.rating || '—'}</div>
            <div className="sup-stat-lbl">{supplier.reviews} reviews</div>
          </div>
          <div className="sup-stat">
            <div className="sup-stat-val">{supplier.discount}%</div>
            <div className="sup-stat-lbl">Bulk Discount</div>
          </div>
          <div className="sup-stat">
            <div className="sup-stat-val">{supplier.deliveryDays}d</div>
            <div className="sup-stat-lbl">Delivery</div>
          </div>
          <div className="sup-stat">
            <div className="sup-stat-val">{supplierProducts.length}</div>
            <div className="sup-stat-lbl">Products</div>
          </div>
        </div>
      </div>

      {/* Contact Numbers */}
      {supplier.contactNumbers && supplier.contactNumbers.length > 0 && (
        <div className="profile-contacts">
          <div className="profile-contacts-title">Contact Numbers</div>
          {supplier.contactNumbers.map((num, i) => (
            <a key={i} href={`tel:${num}`} className="contact-row">
              <div className="contact-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.4 2 2 0 0 1 3.58 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.32 6.32l1.84-1.84a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div>
                <div className="contact-num">{num}</div>
                <div className="contact-label">Tap to call</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Categories */}
      {supplierCategories.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-title">Categories</div>
          <div className="chips-row" style={{ flexWrap: 'wrap' }}>
            {supplierCategories.map(cat => (
              <span key={cat} className="chip active" style={{ cursor: 'default' }}>{cat}</span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isOwner && (
        <div style={{ padding: '0 16px 4px', display:'flex', gap:10 }}>
          <button className="btn btn-primary" style={{ flex:2 }} onClick={() => setShowBulk(true)}>
            📦 Bulk Order ({supplier.discount}% off)
          </button>
          {user && (
            <button
              className="btn btn-ghost"
              style={{ flex:1, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}
              onClick={async () => {
                try {
                  const res = await fetch('/api/conversations', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ userId1: user.id, userId2: supplier.authUserId }),
                  });
                  const conv = await res.json();
                  if (conv.id) router.push(`/chat/${conv.id}`);
                } catch { /* ignore */ }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Chat
            </button>
          )}
        </div>
      )}

      {/* Products */}
      <div className="profile-section">
        <div className="profile-section-title">Products ({supplierProducts.length})</div>
        {supplierProducts.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 20 }}>
            <div className="empty-icon">📦</div>
            <div className="empty-title">No products yet</div>
          </div>
        ) : (
          <div className="product-grid">
            {supplierProducts.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                isWishlisted={wishlistSet.has(p.id)}
                stock={inventoryMap.get(p.id) ?? p.stock}
                onAddToCart={addToCart}
                onToggleWishlist={toggleWishlist}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bulk Order Modal ─────────────────────────────── */}
      {showBulk && (
        <div className="modal-overlay" onClick={() => !bulkLoading && setShowBulk(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            {bulkSent ? (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Bulk Order Sent!</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: 20 }}>
                  {supplier.name} will contact you soon
                </div>
                <button className="btn btn-primary btn-full" onClick={() => { setShowBulk(false); setBulkSent(false); setBulkItems([{ productId: 0, qty: 1 }]); setBulkName(''); setBulkPhone(''); setBulkNotes(''); }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <span>📦 Bulk Order — {supplier.name}</span>
                  <button className="modal-close" onClick={() => setShowBulk(false)}>✕</button>
                </div>
                <div className="modal-body">
                  <div className="bulk-discount-note">
                    🏷️ {supplier.discount}% bulk discount applies · Min order: {supplier.minOrder} units
                  </div>

                  <div className="form-group">
                    <label className="form-label">Your Name *</label>
                    <input className="form-input" placeholder="Full name" value={bulkName} onChange={e => setBulkName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input className="form-input" placeholder="+252 XX XXX XXXX" value={bulkPhone} onChange={e => setBulkPhone(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Products</label>
                    {bulkItems.map((row, i) => (
                      <div key={i} className="bulk-item-row">
                        <select
                          className="form-input bulk-product-select"
                          value={row.productId}
                          onChange={e => updateBulkRow(i, 'productId', parseInt(e.target.value, 10))}
                        >
                          <option value={0}>Select product…</option>
                          {supplierProducts.map(p => (
                            <option key={p.id} value={p.id}>{p.icon} {p.name} — ${p.price.toFixed(2)}</option>
                          ))}
                        </select>
                        <input
                          className="form-input bulk-qty-input"
                          type="number"
                          min={1}
                          placeholder="Qty"
                          value={row.qty}
                          onChange={e => updateBulkRow(i, 'qty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                        />
                        {bulkItems.length > 1 && (
                          <button className="contact-remove-btn" onClick={() => removeBulkRow(i)}>✕</button>
                        )}
                      </div>
                    ))}
                    <button className="add-contact-btn" onClick={addBulkRow}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add product
                    </button>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notes (optional)</label>
                    <textarea className="form-input" rows={2} style={{ resize: 'vertical', fontFamily: 'inherit' }} placeholder="Delivery instructions, custom requirements…" value={bulkNotes} onChange={e => setBulkNotes(e.target.value)} />
                  </div>

                  <button
                    className="btn btn-primary btn-full btn-lg"
                    onClick={handleBulkSubmit}
                    disabled={bulkLoading || !bulkName.trim() || bulkItems.every(r => r.productId === 0)}
                  >
                    {bulkLoading ? 'Submitting…' : 'Submit Bulk Order'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
