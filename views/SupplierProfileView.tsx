'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from '@/lib/hashRouter';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { getCategoryColor, hexToRgba, getCategoryById, getSubcategories } from '@/lib/data';
import { useIncrementalList } from '@/lib/useIncrementalList';
import { shuffleStable, useShuffleSeed } from '@/lib/shuffle';
import { resolveListing, type ClaimRow, type Listing } from '@/lib/listings';
import ProductCard from '@/components/ProductCard';
import StoreMap from '@/components/StoreMap';
import StoreAvatar from '@/components/StoreAvatar';
import { getSupabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';

interface BulkItem { productId: number; qty: number; }

export default function SupplierProfilePage({ slug }: { slug?: string } = {}) {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const { state, addToCart, toggleWishlist, toast } = useApp();
  const wishlistSet  = useMemo(() => new Set(state.wishlist),    [state.wishlist]);
  const inventoryMap = useMemo(() =>
    new Map(state.inventory.map(i => [i.id, i.stock])),
  [state.inventory]);
  const { currentSupplier, user, accountType } = useAuth();
  const { products, suppliers, loading } = state;
  // MOQ / minimum order is wholesale info — only business/supplier viewers see it.
  const isB2bViewer = accountType === 'business' || accountType === 'supplier';

  // Reached two ways: '/supplier/:id' (hash route) and the clean storefront
  // path '/storename' (resolved by slug).
  const paramId  = parseInt(params.id, 10);
  const supplier = slug
    ? suppliers.find(s => s.slug === slug)
    : suppliers.find(s => s.id === paramId);
  const supplierId = supplier?.id ?? (slug ? -1 : paramId);

  // Claim-model stores (a business sourcing from a wholesaler) own no catalog
  // rows — their products live in business_products. Pull those in so the
  // storefront shows what the store actually sells, at its retail price.
  const [claimedProducts, setClaimedProducts] = useState<Product[]>([]);
  useEffect(() => {
    if (supplierId <= 0) return;
    let cancelled = false;
    fetch(`/api/business-products?supplierId=${supplierId}`)
      .then(r => r.json())
      .then((bp) => {
        if (cancelled || !Array.isArray(bp)) return;
        // resolveListing applies this store's own overrides (photos, name,
        // price, every detail) over the shared catalog row.
        setClaimedProducts(
          (bp as ClaimRow[])
            .filter(x => x.isActive && x.product)
            .map(resolveListing)
            .filter((p): p is Listing => p !== null),
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [supplierId]);

  const supplierProducts = useMemo(() => {
    const byId = new Map<number, Product>(
      products.filter(p => p.supplierId === supplierId).map(p => [p.id, p]),
    );
    for (const p of claimedProducts) if (!byId.has(p.id)) byId.set(p.id, p);
    return Array.from(byId.values());
  }, [products, supplierId, claimedProducts]);

  const supplierCategories = useMemo(
    () => Array.from(new Set(supplierProducts.map(p => p.category))),
    [supplierProducts]
  );

  // ── In-store search & category filter ───────────────────
  const shuffleSeed = useShuffleSeed();
  const [query,     setQuery]     = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [activeSub, setActiveSub] = useState('all');

  // Subcategories present in this store, for the selected category only.
  const storeSubcategories = useMemo(() => {
    if (activeCat === 'all') return [];
    return getSubcategories(activeCat)
      .filter(s => supplierProducts.some(p => p.category === activeCat && p.subCategory === s.id));
  }, [activeCat, supplierProducts]);

  const filteredProducts = useMemo(() => {
    // Shuffle first (stable for the session) so a bulk-imported catalog isn't
    // shown in upload order; the filters below preserve that order.
    let list = shuffleStable(supplierProducts, shuffleSeed);
    if (activeCat !== 'all') list = list.filter(p => p.category === activeCat);
    if (activeSub !== 'all') list = list.filter(p => p.subCategory === activeSub);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q)          ||
        p.description.toLowerCase().includes(q)   ||
        p.category.toLowerCase().includes(q)      ||
        p.sku.toLowerCase().includes(q)           ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [supplierProducts, shuffleSeed, activeCat, activeSub, query]);

  // A big storefront (thousands of items) must not mount every card at once.
  const { visible, hasMore, sentinelRef } =
    useIncrementalList(filteredProducts, `${query}|${activeCat}|${activeSub}`);

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

    // Pricing, totals, and the order id are computed server-side from the
    // DB — bulk orders are inquiries, so the server does not touch stock.
    try {
      let token: string | undefined;
      if (user) {
        const { data: { session } } = await getSupabase().auth.getSession();
        token = session?.access_token;
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          customerName: bulkName,
          customerPhone: bulkPhone,
          userId: user?.id ?? null,
          items: validItems.map(r => ({ id: r.productId, qty: r.qty })),
          paymentMethod: 'bulk',
          status: 'bulk_pending',
          notes: `Bulk order for ${supplier?.name ?? 'supplier'}. ${bulkNotes}`,
        }),
      });
      if (res.ok) {
        setBulkSent(true);
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.error ?? 'Could not submit bulk order. Please try again.', 'error');
      }
    } catch {
      toast('Network error — bulk order was not sent.', 'error');
    }

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

        <div className="profile-avatar"><StoreAvatar value={supplier.icon} /></div>
        <div className="profile-name">{supplier.name}</div>
        {supplier.onlineOnly ? (
          <div className="profile-loc" style={{ color: 'var(--primary)' }}><span>🌐</span> Online store · delivery only</div>
        ) : supplier.location && (
          <div className="profile-loc"><span>📍</span> {supplier.location}</div>
        )}

        <div className="profile-badges">
          {supplier.onlineOnly && (
            <span className="sup-badge custom" style={{ background: 'var(--primary)', color: '#fff' }}>🌐 Online only</span>
          )}
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

      {/* Store location map + route — never for online-only stores */}
      {!supplier.onlineOnly && typeof supplier.latitude === 'number' && typeof supplier.longitude === 'number' && (
        <div className="profile-section">
          <StoreMap
            lat={supplier.latitude}
            lng={supplier.longitude}
            storeName={supplier.name}
            storeIcon={supplier.icon}
          />
        </div>
      )}

      {/* Categories — filter this store's catalog */}
      {supplierCategories.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-title">Categories</div>
          <div className="chips-row" style={{ flexWrap: 'wrap' }}>
            <button
              className={`chip${activeCat === 'all' ? ' active' : ''}`}
              onClick={() => { setActiveCat('all'); setActiveSub('all'); }}
            >
              All
            </button>
            {supplierCategories.map(cat => {
              const meta = getCategoryById(cat);
              return (
                <button
                  key={cat}
                  className={`chip${activeCat === cat ? ' active' : ''}`}
                  onClick={() => { setActiveCat(cat); setActiveSub('all'); }}
                >
                  {meta ? `${meta.icon} ${meta.name}` : cat}
                </button>
              );
            })}
          </div>

          {/* Subcategories — only for the selected category */}
          {storeSubcategories.length > 0 && (
            <div className="chips-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              <button
                className={`chip${activeSub === 'all' ? ' active' : ''}`}
                onClick={() => setActiveSub('all')}
              >
                All {getCategoryById(activeCat)?.name ?? ''}
              </button>
              {storeSubcategories.map(sub => (
                <button
                  key={sub.id}
                  className={`chip${activeSub === sub.id ? ' active' : ''}`}
                  onClick={() => setActiveSub(sub.id)}
                >
                  {sub.icon} {sub.name}
                </button>
              ))}
            </div>
          )}
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
        <div className="profile-section-title">
          Products ({filteredProducts.length}
          {filteredProducts.length !== supplierProducts.length && ` of ${supplierProducts.length}`})
        </div>

        {/* Search within this store */}
        {supplierProducts.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              className="form-input"
              type="search"
              placeholder={`Search in ${supplier.name}…`}
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ paddingLeft: 38, paddingRight: query ? 38 : 12 }}
              aria-label={`Search products in ${supplier.name}`}
            />
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: .6 }}>
              🔍
            </span>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {supplierProducts.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 20 }}>
            <div className="empty-icon">📦</div>
            <div className="empty-title">No products yet</div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 20 }}>
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No matching products</div>
            <div className="empty-text">
              Nothing here matches{query ? ` “${query}”` : ' this filter'}. Try a different search or category.
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 12 }}
              onClick={() => { setQuery(''); setActiveCat('all'); setActiveSub('all'); }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="product-grid">
              {visible.map(p => (
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
            {hasMore && (
              <div ref={sentinelRef} className="empty-state" style={{ padding: 24 }}>
                <div className="spinner" style={{ width: 22, height: 22 }} />
              </div>
            )}
          </>
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
                    🏷️ {supplier.discount}% bulk discount applies
                    {isB2bViewer && <> · Min order: {supplier.minOrder} units</>}
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
                            <option key={p.id} value={p.id}>{p.name} — ${p.price.toFixed(2)}</option>
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
