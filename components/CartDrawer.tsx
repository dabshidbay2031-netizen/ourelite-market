'use client';

import { useMemo } from 'react';
import { useRouter } from '@/lib/hashRouter';
import { useApp } from '@/context/AppContext';
import ProductImage from '@/components/ProductImage';

/** A cart's items grouped by the shop that sells them. */
interface ShopGroup {
  shopId:   number | null;
  shopName: string;
  shopIcon: string;
  items:    { id: number; qty: number }[];
  subtotal: number;
}

export default function CartDrawer() {
  const router = useRouter();
  const { state, removeFromCart, changeQty, clearCart, setCartOpen } = useApp();
  const { cart, cartOpen, products, suppliers } = state;

  // Group cart items by the shop (product.supplierId). Each shop is checked out
  // separately — a customer picks which shop's order to place.
  const groups = useMemo<ShopGroup[]>(() => {
    const byShop = new Map<number | null, ShopGroup>();
    for (const item of cart) {
      const p = products.find(x => x.id === item.id);
      if (!p) continue;
      const shopId = p.supplierId ?? null;
      const sup = shopId != null ? suppliers.find(s => s.id === shopId) : null;
      let g = byShop.get(shopId);
      if (!g) {
        g = {
          shopId,
          shopName: sup?.name ?? 'Mogarenta',
          shopIcon: sup?.icon ?? '🏪',
          items: [], subtotal: 0,
        };
        byShop.set(shopId, g);
      }
      g.items.push(item);
      g.subtotal += p.price * item.qty;
    }
    return Array.from(byShop.values());
  }, [cart, products, suppliers]);

  const totalCount = cart.reduce((n, i) => n + i.qty, 0);

  const goCheckout = (shopId: number | null) => {
    setCartOpen(false);
    // A null-shop group (catalog items with no supplier) uses the plain route.
    router.push(shopId != null ? `/checkout/${shopId}` : '/checkout');
  };

  return (
    <>
      <div
        className={`overlay ${cartOpen ? 'show' : ''}`}
        onClick={() => setCartOpen(false)}
      />
      <div className={`cart-drawer ${cartOpen ? 'open' : ''}`}>
        <div className="drawer-handle" />
        <div className="drawer-header">
          <span className="drawer-title">Cart ({totalCount} items)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {cart.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearCart}>Clear</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setCartOpen(false)}>✕</button>
          </div>
        </div>

        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🛒</div>
              <div className="empty-title">Cart is empty</div>
              <div className="empty-sub">Add products to get started</div>
            </div>
          ) : (
            <>
              {groups.length > 1 && (
                <div className="cart-multishop-hint">
                  🛍️ Your cart has items from {groups.length} shops. Check out one shop at a time.
                </div>
              )}
              {groups.map(g => (
                <div key={g.shopId ?? 'none'} className="cart-shop-group">
                  <div className="cart-shop-header">
                    <span className="cart-shop-name">{g.shopIcon} {g.shopName}</span>
                    <span className="cart-shop-subtotal">${g.subtotal.toFixed(2)}</span>
                  </div>

                  {g.items.map(item => {
                    const p = products.find(x => x.id === item.id);
                    if (!p) return null;
                    return (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-icon">
                          <ProductImage imageUrl={p.imageUrl} imageUrls={p.imageUrls} name={p.name} style={{ borderRadius: 8 }} />
                        </div>
                        <div className="cart-item-info">
                          <div className="cart-item-name">{p.name}</div>
                          <div className="cart-item-price">${(p.price * item.qty).toFixed(2)}</div>
                        </div>
                        <div className="qty-control">
                          <button className="qty-btn" onClick={() => changeQty(item.id, -1)}>−</button>
                          <span className="qty-value">{item.qty}</span>
                          <button className="qty-btn" onClick={() => changeQty(item.id, 1)}>+</button>
                          <button className="qty-btn" onClick={() => removeFromCart(item.id)}
                            style={{ color: 'var(--danger)' }}>✕</button>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    className="btn btn-primary btn-full cart-shop-checkout"
                    onClick={() => goCheckout(g.shopId)}
                  >
                    Checkout {g.shopName} — ${g.subtotal.toFixed(2)}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
