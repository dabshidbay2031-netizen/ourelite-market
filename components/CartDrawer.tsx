'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import ProductImage from '@/components/ProductImage';

export default function CartDrawer() {
  const router = useRouter();
  const { state, removeFromCart, changeQty, clearCart, cartTotal, setCartOpen } = useApp();
  const { cart, cartOpen, discount } = state;

  const subtotal = cartTotal();
  const discountAmt = (subtotal * discount) / 100;
  const total = subtotal - discountAmt;

  return (
    <>
      <div
        className={`overlay ${cartOpen ? 'show' : ''}`}
        onClick={() => setCartOpen(false)}
      />
      <div className={`cart-drawer ${cartOpen ? 'open' : ''}`}>
        <div className="drawer-handle" />
        <div className="drawer-header">
          <span className="drawer-title">Cart ({cart.reduce((n, i) => n + i.qty, 0)} items)</span>
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
            cart.map(item => {
              const p = state.products.find(x => x.id === item.id);
              if (!p) return null;
              return (
                <div key={item.id} className="cart-item">
                  <div className="cart-item-icon">
                    <ProductImage icon={p.icon} imageUrl={p.imageUrl} imageUrls={p.imageUrls} name={p.name} style={{ borderRadius: 8 }} />
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
            })
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-footer">
            <div className="cart-totals">
              <div className="cart-total-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="cart-total-row" style={{ color: 'var(--success)' }}>
                  <span>Discount ({discount}%)</span>
                  <span>-${discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="cart-total-row grand">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => { setCartOpen(false); router.push('/checkout'); }}
            >
              Checkout — ${total.toFixed(2)}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
