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
import { useHeroBanner } from '@/lib/useHeroBanner';
import { districtFor, MOGADISHU_DISTRICTS } from '@/lib/districts';

export default function ExplorePage() {
  const router = useRouter();
  const { state, setCartOpen, addToCart, toggleWishlist } = useApp();
  const { accountType } = useAuth();
  const { products, loading } = state;
  const { canClaim, claim, isMine, claimingId } = useClaimProduct();
  const hero = useHeroBanner();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSub, setActiveSub] = useState('all');
  const [activeDistrict, setActiveDistrict] = useState('all');

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

  // Which stores are internet-only (no shopfront) → card shows "🌐 Online store".
  const onlineBySupplier = useMemo(() =>
    new Map(state.suppliers.map(s => [s.id, !!s.onlineOnly])),
  [state.suppliers]);

  // Recognised Mogadishu district per store (GPS only, no free-text fallback) —
  // powers the district filter so "Hodan" matches only stores actually in Hodan.
  const recognizedDistrictBySupplier = useMemo(() =>
    new Map(state.suppliers.map(s => [s.id, districtFor(s.latitude, s.longitude)])),
  [state.suppliers]);

  // Only offer districts that actually have products, so the picker never
  // shows an option that resolves to an empty grid.
  const availableDistricts = useMemo(() => {
    const present = new Set<string>();
    for (const p of products) {
      const d = p.supplierId != null ? recognizedDistrictBySupplier.get(p.supplierId) : null;
      if (d) present.add(d);
    }
    return MOGADISHU_DISTRICTS.filter(d => present.has(d.name))
      .map(d => d.name)
      .sort((a, b) => a.localeCompare(b));
  }, [products, recognizedDistrictBySupplier]);

  const filtered = useMemo(() => {
    // Filter out B2B-only products for non-business/supplier users
    let list = products.filter(p => !p.isB2b || accountType === 'business' || accountType === 'supplier');
    if (activeCategory !== 'all') list = list.filter(p => p.category === activeCategory);
    if (activeSub !== 'all')      list = list.filter(p => p.subCategory === activeSub);
    if (activeDistrict !== 'all') list = list.filter(p =>
      p.supplierId != null && recognizedDistrictBySupplier.get(p.supplierId) === activeDistrict);
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
  }, [products, search, activeCategory, activeSub, activeDistrict, recognizedDistrictBySupplier, accountType]);

  const bestSellers = useMemo(() =>
    [...products].sort((a, b) => b.sold - a.sold).slice(0, 8),
  [products]);

  // Render the grid in slices — mounting all 600+ cards at once froze first paint
  const { visible, hasMore, sentinelRef } =
    useIncrementalList(filtered, `${search}|${activeCategory}|${activeSub}|${activeDistrict}`);

  return (
    <div className="page-anim">
      {/* The Explore header search hands off to the dedicated Search page
          (better results: stores, nearby offers, barcode) instead of the
          simple in-place filter. */}
      <Header searchQuery={search} onSearch={setSearch} onSearchFocus={() => router.push('/search')} />

      {/* Hot Deals Banner — copy & image configurable by admins (Admin → Storefront) */}
      {!search && activeCategory === 'all' && activeDistrict === 'all' && hero.enabled && (
        <div className={`banner${hero.imageUrl ? ' banner-has-photo' : ''}`}>
          {hero.imageUrl && (
            // Full-bleed hero photo behind the copy (aria-hidden — decorative)
            // eslint-disable-next-line @next/next/no-img-element
            <img className="banner-bg" src={hero.imageUrl} alt="" aria-hidden="true" />
          )}
          <div className="banner-content">
            {hero.tag && <span className="banner-tag">{hero.tag}</span>}
            {hero.title && <h2>{hero.title}</h2>}
            {hero.subtitle && <p>{hero.subtitle}</p>}
            {hero.ctaLabel && (
              <button className="btn btn-secondary btn-sm" onClick={() => setCartOpen(true)}>
                {hero.ctaLabel}
              </button>
            )}
          </div>
          {!hero.imageUrl && <span className="banner-emoji">🛍️</span>}
        </div>
      )}

      {/* District filter — browse products by Mogadishu district */}
      <div className="district-filter">
        <span className="district-filter-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          District
        </span>
        <select
          className="district-select"
          value={activeDistrict}
          onChange={e => setActiveDistrict(e.target.value)}
          aria-label="Filter products by Mogadishu district"
        >
          <option value="all">All Mogadishu</option>
          {availableDistricts.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {activeDistrict !== 'all' && (
          <button className="district-clear" onClick={() => setActiveDistrict('all')} aria-label="Clear district filter">✕</button>
        )}
      </div>

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
      {!search && activeCategory === 'all' && activeDistrict === 'all' && bestSellers.length > 0 && (
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
          {activeDistrict !== 'all' && (
            <span style={{ color: 'var(--primary)', fontWeight: 700 }}> · 📍 {activeDistrict}</span>
          )}
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
                storeOnlineOnly={p.supplierId != null ? onlineBySupplier.get(p.supplierId) ?? false : false}
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
