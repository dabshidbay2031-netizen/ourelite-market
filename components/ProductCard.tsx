'use client';

import { memo } from 'react';
import { useRouter } from 'next/navigation';
import { getCategoryColor, hexToRgba, discountPct } from '@/lib/data';
import type { Product } from '@/lib/types';

interface Props {
  product:          Product;
  isWishlisted:     boolean;
  stock:            number;
  /** Stable reference — pass addToCart from useApp() directly */
  onAddToCart:      (id: number) => void;
  /** Stable reference — pass toggleWishlist from useApp() directly */
  onToggleWishlist: (id: number) => void;
}

/**
 * Memoised: only re-renders when product data, wishlist status, or stock
 * changes for THIS specific product. Decoupled from AppContext so the
 * parent's re-renders don't cascade into 30+ card re-renders.
 */
function ProductCard({ product, isWishlisted, stock, onAddToCart, onToggleWishlist }: Props) {
  const router   = useRouter();
  const color    = getCategoryColor(product.category);
  const bgStyle  = { background: hexToRgba(color, 0.12) };
  const pct      = discountPct(product.price, product.originalPrice);

  return (
    <div className="product-card" onClick={() => router.push(`/product/${product.id}`)}>
      <div className="product-img" style={bgStyle}>
        {pct > 0 && <span className="discount-tag">-{pct}%</span>}
        <button
          className="wishlist-btn"
          onClick={e => { e.stopPropagation(); onToggleWishlist(product.id); }}
        >
          {isWishlisted ? '❤️' : '🤍'}
        </button>
        {product.imageUrls?.[0] || product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrls?.[0] ?? product.imageUrl!}
            alt={product.name}
            className="product-photo"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span>{product.icon}</span>
        )}
      </div>
      <div className="product-body">
        <div className="product-name">{product.name}</div>
        <div className="product-rating">
          <span className="star">★</span>
          {product.rating} ({product.reviews})
        </div>
        <div className="product-price">
          <span className="price-current">${product.price.toFixed(2)}</span>
          {product.originalPrice > product.price && (
            <span className="price-original">${product.originalPrice.toFixed(2)}</span>
          )}
        </div>
        <button
          className="product-add-btn"
          onClick={e => { e.stopPropagation(); onAddToCart(product.id); }}
          disabled={stock === 0}
        >
          {stock === 0 ? 'Out of stock' : '+ Add to Cart'}
        </button>
      </div>
    </div>
  );
}

export default memo(ProductCard);
