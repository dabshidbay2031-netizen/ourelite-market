'use client';

import { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { CATEGORIES, SUBCATEGORIES } from '@/lib/data';
import type { Product } from '@/lib/types';

const BarcodeScanner = lazy(() => import('@/components/BarcodeScanner'));

/* ── Product Claim Modal ──────────────────────────────────────────────────── */
interface ClaimModalProps {
  product:    Product;
  supplierId: number;
  onClose:    () => void;
  onClaimed:  () => void;
}

function ClaimModal({ product, supplierId, onClose, onClaimed }: ClaimModalProps) {
  const { toast }                 = useApp();
  const [price,    setPrice]      = useState(String(product.price));
  const [stockQty, setStockQty]   = useState('10');
  const [saving,   setSaving]     = useState(false);

  async function handleClaim() {
    const p = parseFloat(price);
    if (!p || p <= 0) { toast('Enter a valid price', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/business-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supplierId,
          productId:   product.id,
          customPrice: p,
          stockQty:    parseInt(stockQty) || 0,
        }),
      });
      if (res.ok) {
        toast(`✅ "${product.name}" added to your store!`, 'success');
        onClaimed();
        onClose();
      } else {
        const err = await res.json();
        toast(err.error ?? 'Failed to add product', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>🛒 Add to Your Store</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Product preview */}
          <div className="claim-product-card">
            <div className="claim-product-icon">{product.icon}</div>
            <div className="claim-product-info">
              <div className="claim-product-name">{product.name}</div>
              {product.brand && (
                <div className="claim-product-brand">{product.brand}</div>
              )}
              <div className="claim-product-meta">
                {CATEGORIES.find(c => c.id === product.category)?.icon}{' '}
                {CATEGORIES.find(c => c.id === product.category)?.name}
                {product.subCategory && (
                  <span> &rsaquo; {SUBCATEGORIES[product.category]?.find(s => s.id === product.subCategory)?.name}</span>
                )}
              </div>
              {product.barcode && (
                <div className="claim-product-barcode">🔢 {product.barcode}</div>
              )}
              {product.tags && product.tags.length > 0 && (
                <div className="claim-tags-row">
                  {product.tags.slice(0, 4).map(t => (
                    <span key={t} className="claim-tag">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="claim-price-row">
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              Global catalog price: <strong>${product.price.toFixed(2)}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Your Selling Price ($) *</label>
              <input
                className="form-input"
                type="number" min="0" step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Your Stock Qty</label>
              <input
                className="form-input"
                type="number" min="0"
                value={stockQty}
                onChange={e => setStockQty(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleClaim}
            disabled={saving}
            style={{ marginTop: 8 }}
          >
            {saving
              ? <><span className="btn-spinner" /> Adding…</>
              : '✓ Add to My Store'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Barcode result card ──────────────────────────────────────────────────── */
interface BarcodeResultProps {
  product:    Product | null;
  barcode:    string;
  onClaim:    (p: Product) => void;
  onAddCart:  (p: Product) => void;
  onDismiss:  () => void;
  isBusiness: boolean;
}

function BarcodeResult({ product, barcode, onClaim, onAddCart, onDismiss, isBusiness }: BarcodeResultProps) {
  if (!product) {
    return (
      <div className="barcode-result not-found">
        <div className="barcode-result-icon">❓</div>
        <div>
          <div className="barcode-result-title">Product not found</div>
          <div className="barcode-result-sub">Barcode: <strong>{barcode}</strong> is not in the database yet.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>✕</button>
      </div>
    );
  }

  return (
    <div className="barcode-result found">
      <div className="barcode-result-icon">{product.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="barcode-result-title">{product.name}</div>
        {product.brand && <div className="barcode-result-brand">{product.brand}</div>}
        <div className="barcode-result-price">${product.price.toFixed(2)}</div>
        {product.tags && product.tags.length > 0 && (
          <div className="claim-tags-row" style={{ marginTop: 4 }}>
            {product.tags.slice(0, 3).map(t => <span key={t} className="claim-tag">{t}</span>)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        {isBusiness ? (
          <button className="btn btn-primary btn-sm" onClick={() => onClaim(product)}>
            + Add to Store
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => onAddCart(product)}>
            🛒 Add to Cart
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>✕</button>
      </div>
    </div>
  );
}

/* ── Search inner ─────────────────────────────────────────────────────────── */
function SearchInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { state, addToCart, toggleWishlist } = useApp();
  const { user, accountType, currentSupplier } = useAuth();
  const { products, loading }  = state;

  const wishlistSet  = useMemo(() => new Set(state.wishlist),    [state.wishlist]);
  const inventoryMap = useMemo(() =>
    new Map(state.inventory.map(i => [i.id, i.stock])),
  [state.inventory]);

  const [query,           setQuery]           = useState(searchParams.get('q') ?? '');
  const [activeCategory,  setActiveCategory]  = useState('all');
  const [activeSubCat,    setActiveSubCat]    = useState('all');
  const [showScanner,     setShowScanner]     = useState(false);
  const [scanLoading,     setScanLoading]     = useState(false);
  const [scannedBarcode,  setScannedBarcode]  = useState('');
  const [scannedProduct,  setScannedProduct]  = useState<Product | null | 'none'>('none');
  const [claimProduct,    setClaimProduct]    = useState<Product | null>(null);

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  const subCats = activeCategory !== 'all' ? (SUBCATEGORIES[activeCategory] ?? []) : [];

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory !== 'all') list = list.filter(p => p.category === activeCategory);
    if (activeSubCat  !== 'all') list = list.filter(p => p.subCategory === activeSubCat);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q)         ||
        p.description.toLowerCase().includes(q)  ||
        p.category.toLowerCase().includes(q)     ||
        p.sku.toLowerCase().includes(q)           ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, query, activeCategory, activeSubCat]);

  /* ── Barcode detected callback ─── */
  async function handleBarcode(code: string) {
    setScannedBarcode(code);
    setScannedProduct(null); // loading
    setScanLoading(true);
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json();
        setScannedProduct(data ?? 'none');
      } else {
        setScannedProduct('none');
      }
    } catch {
      setScannedProduct('none');
    }
    setScanLoading(false);
  }

  const isBusiness = accountType === 'business' && !!currentSupplier;

  return (
    <div className="page-anim">
      {/* ── Search bar ── */}
      <div className="search-page-header">
        <button className="search-back-btn" onClick={() => router.back()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <input
          className="search-page-input"
          placeholder="Search by name, brand, tag…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button className="search-clear-btn" onClick={() => setQuery('')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
        {/* Barcode scan button */}
        <button
          className="search-scan-btn"
          onClick={() => setShowScanner(true)}
          title="Scan barcode"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3"  width="4" height="4" rx=".5"/>
            <rect x="17" y="3" width="4" height="4" rx=".5"/>
            <rect x="3" y="17" width="4" height="4" rx=".5"/>
            <line x1="7"  y1="5"  x2="17" y2="5"/>
            <line x1="7"  y1="19" x2="13" y2="19"/>
            <line x1="19" y1="7"  x2="19" y2="13"/>
            <line x1="5"  y1="7"  x2="5"  y2="17"/>
            <line x1="17" y1="9"  x2="17" y2="17"/>
            <line x1="9"  y1="17" x2="9"  y2="21"/>
            <line x1="13" y1="13" x2="13" y2="17"/>
            <line x1="13" y1="9"  x2="21" y2="9"/>
          </svg>
        </button>
      </div>

      {/* ── Barcode scan result ── */}
      {(scannedBarcode || scanLoading) && (
        <div style={{ padding: '8px 16px' }}>
          {scanLoading ? (
            <div className="barcode-result loading">
              <span className="btn-spinner" style={{ flexShrink: 0 }} /> Looking up barcode <strong>{scannedBarcode}</strong>…
            </div>
          ) : (
            <BarcodeResult
              product={scannedProduct === 'none' ? null : scannedProduct}
              barcode={scannedBarcode}
              isBusiness={isBusiness}
              onClaim={p => setClaimProduct(p)}
              onAddCart={p => { addToCart(p.id); setScannedBarcode(''); setScannedProduct('none'); }}
              onDismiss={() => { setScannedBarcode(''); setScannedProduct('none'); }}
            />
          )}
        </div>
      )}

      {/* ── Category chips ── */}
      <div className="chips-row" style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <button className={`chip ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => { setActiveCategory('all'); setActiveSubCat('all'); }}>All</button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`chip ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => { setActiveCategory(cat.id); setActiveSubCat('all'); }}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* ── Subcategory chips (shown when category selected) ── */}
      {subCats.length > 0 && (
        <div className="chips-row" style={{ padding: '6px 16px', background: 'var(--bg)' }}>
          <button className={`chip chip-sm ${activeSubCat === 'all' ? 'active' : ''}`} onClick={() => setActiveSubCat('all')}>All</button>
          {subCats.map(s => (
            <button
              key={s.id}
              className={`chip chip-sm ${activeSubCat === s.id ? 'active' : ''}`}
              onClick={() => setActiveSubCat(s.id)}
            >
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Results count ── */}
      {!loading && (query || activeCategory !== 'all') && (
        <div className="search-results-count">
          {filtered.length === 0
            ? 'No results'
            : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}${query ? ` for "${query}"` : ''}`}
        </div>
      )}

      {/* ── Products grid ── */}
      {loading ? (
        <div className="product-grid" style={{ padding: '12px 16px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="product-card skeleton-card">
              <div className="skeleton" style={{ height: 110, borderRadius: 12 }} />
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ height: 13, width: '80%', borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 11, width: '50%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <div className="empty-icon">🔍</div>
          <div className="empty-title">No products found</div>
          <div className="empty-sub">
            {query ? `Try a different search term` : 'No products in this category'}
          </div>
          {user && isBusiness && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => setShowScanner(true)}
            >
              📷 Scan Barcode to Add
            </button>
          )}
        </div>
      ) : (
        <div className="product-grid" style={{ padding: '12px 16px' }}>
          {filtered.map(p => (
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

      {/* ── Barcode Scanner Modal ── */}
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onDetected={code => { setShowScanner(false); handleBarcode(code); }}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      {/* ── Product Claim Modal ── */}
      {claimProduct && isBusiness && (
        <ClaimModal
          product={claimProduct}
          supplierId={currentSupplier!.id}
          onClose={() => setClaimProduct(null)}
          onClaimed={() => { setScannedBarcode(''); setScannedProduct('none'); }}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="page-anim" style={{ padding: 40, textAlign: 'center' }}>Loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}
