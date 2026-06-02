'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { CATEGORIES } from '@/lib/data';

export default function POSPage() {
  const { state, addToCart, cartCount, setCartOpen, getStock } = useApp();
  const { user } = useAuth();
  const { products, suppliers, loading } = state;

  const [search, setSearch]               = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [myProductsOnly, setMyProductsOnly] = useState(false);

  // Find current supplier
  const currentSupplier = useMemo(
    () => suppliers.find(s => s.authUserId === user?.id) ?? null,
    [suppliers, user]
  );

  const filtered = useMemo(() => {
    let list = products;

    // "My Products" filter — show only this supplier's products
    if (myProductsOnly && currentSupplier) {
      list = list.filter(p => p.supplierId === currentSupplier.id);
    }

    if (activeCategory !== 'all') list = list.filter(p => p.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)  ||
        ((p as typeof p & { barcode?: string }).barcode ?? '').includes(q)
      );
    }
    return list;
  }, [products, search, activeCategory, myProductsOnly, currentSupplier]);

  const count = cartCount();

  return (
    <div className="page-anim" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 68px)' }}>
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">🖥️ Point of Sale</span>
        {/* My Products toggle — only shown when logged-in user has a supplier account */}
        {currentSupplier && (
          <button
            className={`btn btn-sm ${myProductsOnly ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMyProductsOnly(v => !v)}
            title={myProductsOnly ? 'Showing my products only' : 'Showing all products'}
          >
            {myProductsOnly ? `🏪 ${currentSupplier.icon} Mine` : '🌐 All'}
          </button>
        )}
      </div>

      {myProductsOnly && currentSupplier && (
        <div style={{
          padding: '6px 16px', background: 'var(--primary-light, #EEF2FF)',
          fontSize: '.8rem', color: 'var(--primary)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>{currentSupplier.icon}</span>
          Showing {filtered.length} products for {currentSupplier.name}
        </div>
      )}

      <div className="pos-search-bar">
        <input
          className="pos-search-input"
          placeholder="Search by name, SKU or barcode…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="chips-row">
          <button className={`chip ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>All</button>
          {CATEGORIES.map(cat => (
            <button key={cat.id} className={`chip ${activeCategory === cat.id ? 'active' : ''}`} onClick={() => setActiveCategory(cat.id)}>
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

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
            <div className="empty-icon">{myProductsOnly ? '🏪' : '🔍'}</div>
            <div className="empty-title">
              {myProductsOnly ? 'No products in your store' : 'No products found'}
            </div>
            {myProductsOnly && (
              <div className="empty-sub">Add products in Inventory or your Profile → Store</div>
            )}
          </div>
        ) : (
          <div className="pos-grid">
            {filtered.map(p => {
              const stock = getStock(p.id);
              const supplier = suppliers.find(s => s.id === p.supplierId);
              const hideStock = supplier?.hideStock === true;
              return (
                <div
                  key={p.id}
                  className="pos-item"
                  onClick={() => stock > 0 && addToCart(p.id)}
                  style={stock === 0 ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                >
                  <span className="pos-item-icon">{p.icon}</span>
                  <span className="pos-item-name">{p.name}</span>
                  <span className="pos-item-price">${p.price.toFixed(2)}</span>
                  <span className="pos-item-stock">
                    {stock === 0
                      ? 'Out of stock'
                      : hideStock
                        ? 'In stock'
                        : `${stock} in stock`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {count > 0 && (
        <button className="cart-fab" onClick={() => setCartOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span className="badge">{count}</span>
        </button>
      )}
    </div>
  );
}
