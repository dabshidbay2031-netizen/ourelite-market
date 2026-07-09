'use client';

import { useMemo } from 'react';
import { useRouter } from '@/lib/hashRouter';
import Header from '@/components/Header';
import ProductCard from '@/components/ProductCard';
import { useApp } from '@/context/AppContext';
import { useClaimProduct } from '@/lib/useClaimProduct';
import { districtFor } from '@/lib/districts';

export default function WishlistPage() {
  const router = useRouter();
  const { state, addToCart, toggleWishlist } = useApp();
  const { canClaim, claim, isMine, claimingId } = useClaimProduct();

  const wishlistSet  = useMemo(() => new Set(state.wishlist), [state.wishlist]);
  const inventoryMap = useMemo(() =>
    new Map(state.inventory.map(i => [i.id, i.stock])),
  [state.inventory]);

  const districtBySupplier = useMemo(() =>
    new Map(state.suppliers.map(s =>
      [s.id, districtFor(s.latitude, s.longitude) ?? (s.location || null)])),
  [state.suppliers]);

  const onlineBySupplier = useMemo(() =>
    new Map(state.suppliers.map(s => [s.id, !!s.onlineOnly])),
  [state.suppliers]);

  // Preserve the order items were added (most-recent first).
  const items = useMemo(() => {
    const byId = new Map(state.products.map(p => [p.id, p]));
    return [...state.wishlist].reverse().map(id => byId.get(id)).filter(Boolean);
  }, [state.wishlist, state.products]);

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">❤️ Wishlist</span>
        <span className="text-muted text-sm">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <div className="empty-icon">🤍</div>
          <div className="empty-title">Your wishlist is empty</div>
          <div className="empty-sub">Tap the heart on any product to save it here.</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/')}>
            Browse products
          </button>
        </div>
      ) : (
        <div className="product-grid" style={{ padding: '12px 16px' }}>
          {items.map(p => p && (
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
      )}
    </div>
  );
}
