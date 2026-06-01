'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import Header from '@/components/Header';
import ProductCard from '@/components/ProductCard';
import { useApp } from '@/context/AppContext';
import { CATEGORIES } from '@/lib/data';
import { useView } from '@/context/ViewContext';

/* AppShell is loaded lazily — it only activates when the user navigates
   away from '/'.  First navigation to any page takes ~1s to load the
   component JS; every visit after that is instant.                       */
const AppShell = lazy(() => import('@/components/AppShell'));

function AppShellOverlay() {
  const { viewPath } = useView();
  if (viewPath === '/' || viewPath === '') return null;

  return (
    /* Full-screen overlay — sits on top of ExplorePage, prevents re-mount
       of ExplorePage when returning to '/' (it's just hidden). */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10,
        background: 'var(--bg)',
        overflowY: 'auto',
      }}
    >
      <Suspense fallback={
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12 }}>
          <div className="spinner" style={{ width:28, height:28 }} />
          <span style={{ fontSize:'.82rem', color:'var(--text-muted)' }}>Loading…</span>
        </div>
      }>
        <AppShell />
      </Suspense>
    </div>
  );
}

export default function ExplorePage() {
  const { navigate } = useView();
  const { state, setCartOpen, addToCart, toggleWishlist } = useApp();
  const { products, loading } = state;
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // O(1) lookups instead of Array.includes in every card render
  const wishlistSet  = useMemo(() => new Set(state.wishlist),    [state.wishlist]);
  const inventoryMap = useMemo(() =>
    new Map(state.inventory.map(i => [i.id, i.stock])),
  [state.inventory]);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory !== 'all') list = list.filter(p => p.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q)             ||
        p.description.toLowerCase().includes(q)      ||
        p.sku.toLowerCase().includes(q)              ||
        p.category.toLowerCase().includes(q)         ||
        (p.brand ?? '').toLowerCase().includes(q)    ||
        (p.tags  ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, search, activeCategory]);

  const bestSellers = useMemo(() =>
    [...products].sort((a, b) => b.sold - a.sold).slice(0, 8),
  [products]);

  return (
    <>
    <div className="page-anim">
      <Header searchQuery={search} onSearch={setSearch} />

      {/* Hot Deals Banner */}
      {!search && activeCategory === 'all' && (
        <div className="banner">
          <div>
            <span className="banner-tag">🔥 Hot Deals</span>
            <h2>Up to 30% Off<br/>This Week</h2>
            <p>Limited time offers on top products</p>
            <button className="btn btn-secondary btn-sm" onClick={() => setCartOpen(true)}>
              Shop Now
            </button>
          </div>
          <span className="banner-emoji">🛍️</span>
        </div>
      )}

      {/* Category chips */}
      <div className="explore-categories">
        <div className="chips-row">
          <button
            className={`chip ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`chip ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Best Sellers */}
      {!search && activeCategory === 'all' && bestSellers.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">🏆 Best Sellers</span>
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', gap: 12, padding: '0 16px 16px', scrollbarWidth: 'none' }}>
            {bestSellers.map(p => (
              <div
                key={p.id}
                className="similar-card"
                style={{ flexShrink: 0, width: 140 }}
                onClick={() => navigate(`/product/${p.id}`)}
              >
                <div className="similar-img">{p.icon}</div>
                <div className="similar-body">
                  <div className="similar-name">{p.name}</div>
                  <div className="similar-price">${p.price.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Products grid */}
      <div className="section-header">
        <span className="section-title">
          {search
            ? `Results for "${search}"`
            : activeCategory === 'all'
              ? '🛒 All Products'
              : CATEGORIES.find(c => c.id === activeCategory)?.name}
        </span>
        <span className="text-muted text-sm">{filtered.length} items</span>
      </div>

      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product-card">
              <div className="skeleton" style={{ aspectRatio: '1' }} />
              <div className="product-body" style={{ gap: 8 }}>
                <div className="skeleton" style={{ height: 14, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 32, borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">No products found</div>
          <div className="empty-sub">Try a different search or category</div>
        </div>
      ) : (
        <div className="product-grid">
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
    </div>
    {/* Client-side router overlay — renders all other pages instantly */}
    <AppShellOverlay />
    </>
  );
}
