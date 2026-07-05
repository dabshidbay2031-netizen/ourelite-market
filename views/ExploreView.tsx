'use client';

import { useState, useMemo } from 'react';
import { useRouter } from '@/lib/hashRouter';
import Header from '@/components/Header';
import ProductCard from '@/components/ProductCard';
import ProductImage from '@/components/ProductImage';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { CATEGORIES, SUBCATEGORIES } from '@/lib/data';
import { useClaimProduct } from '@/lib/useClaimProduct';
import { useIncrementalList } from '@/lib/useIncrementalList';
import { districtFor } from '@/lib/districts';

export default function ExplorePage() {
  const router = useRouter();
  const { state, setCartOpen, addToCart, toggleWishlist } = useApp();
  const { accountType } = useAuth();
  const { products, loading } = state;
  const { canClaim, claim, isMine, claimingId } = useClaimProduct();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSub, setActiveSub] = useState('all');

  // Subcategories for the selected category (only shown once a category is picked)
  const subCats = activeCategory !== 'all' ? (SUBCATEGORIES[activeCategory] ?? []) : [];

  // O(1) lookups instead of Array.includes in every card render
  const wishlistSet  = useMemo(() => new Set(state.wishlist),    [state.wishlist]);
  const inventoryMap = useMemo(() =>
    new Map(state.inventory.map(i => [i.id, i.stock])),
  [state.inventory]);

  // Store GPS → recognised district ("📍 Hodan"), falling back to the store's
  // free-text location when it has no coordinates yet.
  const districtBySupplier = useMemo(() =>
    new Map(state.suppliers.map(s =>
      [s.id, districtFor(s.latitude, s.longitude) ?? (s.location || null)])),
  [state.suppliers]);

  const filtered = useMemo(() => {
    // Filter out B2B-only products for non-business/supplier users
    let list = products.filter(p => !p.isB2b || accountType === 'business' || accountType === 'supplier');
    if (activeCategory !== 'all') list = list.filter(p => p.category === activeCategory);
    if (activeSub !== 'all')      list = list.filter(p => p.subCategory === activeSub);
    if (search.trim()) {
      const q = search.toLowerCase();
      // Match the subcategory's display NAME too (e.g. searching "laptops")
      const subName = (p: typeof products[number]) =>
        (SUBCATEGORIES[p.category]?.find(s => s.id === p.subCategory)?.name ?? '').toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q)             ||
        p.description.toLowerCase().includes(q)      ||
        p.sku.toLowerCase().includes(q)              ||
        p.category.toLowerCase().includes(q)         ||
        subName(p).includes(q)                       ||
        (p.brand ?? '').toLowerCase().includes(q)    ||
        (p.tags  ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, search, activeCategory, activeSub, accountType]);

  const bestSellers = useMemo(() =>
    [...products].sort((a, b) => b.sold - a.sold).slice(0, 8),
  [products]);

  // Render the grid in slices — mounting all 600+ cards at once froze first paint
  const { visible, hasMore, sentinelRef } =
    useIncrementalList(filtered, `${search}|${activeCategory}|${activeSub}`);

  return (
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
            onClick={() => { setActiveCategory('all'); setActiveSub('all'); }}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`chip ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => { setActiveCategory(cat.id); setActiveSub('all'); }}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        {/* Subcategory chips — shown once a category is selected */}
        {subCats.length > 0 && (
          <div className="chips-row" style={{ marginTop: 6 }}>
            <button
              className={`chip chip-sm ${activeSub === 'all' ? 'active' : ''}`}
              onClick={() => setActiveSub('all')}
            >
              All
            </button>
            {subCats.map(s => (
              <button
                key={s.id}
                className={`chip chip-sm ${activeSub === s.id ? 'active' : ''}`}
                onClick={() => setActiveSub(s.id)}
              >
                {s.icon} {s.name}
              </button>
            ))}
          </div>
        )}
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
                className="similar-card bestseller-card"
                style={{ flexShrink: 0, width: 140 }}
                onClick={() => router.push(`/product/${p.id}`)}
              >
                <div className="similar-img">
                  <ProductImage imageUrl={p.imageUrl} imageUrls={p.imageUrls} name={p.name} style={{ borderRadius: 8 }} />
                </div>
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
        <>
          <div className="product-grid">
            {visible.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                storeDistrict={p.supplierId != null ? districtBySupplier.get(p.supplierId) ?? null : null}
                isWishlisted={wishlistSet.has(p.id)}
                stock={inventoryMap.get(p.id) ?? p.stock}
                onAddToCart={addToCart}
                onToggleWishlist={toggleWishlist}
                canClaim={canClaim}
                isClaimed={canClaim && isMine(p.id)}
                claiming={claimingId === p.id}
                onClaim={claim}
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
  );
}
