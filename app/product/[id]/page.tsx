'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { getCategoryColor, hexToRgba, discountPct, SUBCATEGORIES } from '@/lib/data';
import { CATEGORIES } from '@/lib/data';

interface Review {
  id: number; userId: string; rating: number;
  comment: string | null; userName: string; userAvatar: string; createdAt: string;
}

interface Props {
  params: { id: string };
}

export default function ProductDetailPage({ params }: Props) {
  const router = useRouter();
  const { state, addToCart, toggleWishlist, getStock } = useApp();
  const { user } = useAuth();
  const { products, suppliers } = state;
  const [qty,        setQty]        = useState(1);
  const [photoIdx,   setPhotoIdx]   = useState(0);
  const [lightbox,   setLightbox]   = useState(false);

  // Reviews state
  const [reviews,       setReviews]       = useState<Review[]>([]);
  const [myRating,      setMyRating]      = useState(0);
  const [myComment,     setMyComment]     = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);

  const productId = parseInt(params.id, 10);
  const product   = products.find(p => p.id === productId);

  // Load reviews on mount
  useEffect(() => {
    if (!productId) return;
    fetch(`/api/reviews?productId=${productId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) { setReviews(data); setReviewsLoaded(true); } })
      .catch(() => setReviewsLoaded(true));
  }, [productId]);

  const myExistingReview = reviews.find(r => r.userId === user?.id);

  const submitReview = async () => {
    if (!user || !myRating) return;
    setReviewLoading(true);
    const res = await fetch('/api/reviews', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        productId, userId: user.id,
        rating:     myRating,
        comment:    myComment.trim() || null,
        userName:   user.displayName ?? (user.email?.split('@')[0] ?? 'User'),
        userAvatar: '👤',
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      setReviews(prev => {
        const filtered = prev.filter(r => r.userId !== user.id);
        return [saved, ...filtered];
      });
      setMyRating(0); setMyComment('');
    }
    setReviewLoading(false);
  };

  /* ── Loading skeleton ─── */
  if (state.loading) {
    return (
      <div className="page-anim detail-wrap">
        <div className="detail-img-wrap" style={{ background: 'var(--border-light)', height: 300 }}>
          <div className="skeleton" style={{ width: 112, height: 112, borderRadius: 16, margin: 'auto' }} />
        </div>
        <div className="detail-body">
          <div className="skeleton" style={{ height: 12, width: '30%', borderRadius: 6, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 22, width: '80%', borderRadius: 6, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 14, width: '50%', borderRadius: 6, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 8, marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="skeleton" style={{ flex: 1, height: 48, borderRadius: 8 }} />
            <div className="skeleton" style={{ flex: 1, height: 48, borderRadius: 8 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <div className="empty-icon">🔍</div>
        <div className="empty-title">Product not found</div>
        <button className="btn btn-primary" onClick={() => router.push('/')}>Go Home</button>
      </div>
    );
  }

  const stock        = getStock(product.id);
  const isWishlisted = state.wishlist.includes(product.id);
  const supplier     = suppliers.find(s => s.id === product.supplierId);
  const similar      = products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 8);
  const color        = getCategoryColor(product.category);
  const bgStyle      = { background: `linear-gradient(135deg, ${hexToRgba(color, 0.12)}, ${hexToRgba(color, 0.06)})` };
  const pct          = discountPct(product.price, product.originalPrice);
  const photos       = product.imageUrls?.length ? product.imageUrls
                     : product.imageUrl          ? [product.imageUrl]
                     : [];
  const hasPhotos    = photos.length > 0;
  const cat          = CATEGORIES.find(c => c.id === product.category);
  const subCat       = product.subCategory
    ? SUBCATEGORIES[product.category]?.find(s => s.id === product.subCategory)
    : null;

  return (
    <div className="page-anim detail-wrap">

      {/* ── Hero: photo gallery OR emoji ─── */}
      {hasPhotos ? (
        <div className="detail-gallery-wrap">
          {/* Back + wishlist */}
          <button className="detail-back" onClick={() => router.back()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <button className="detail-wishlist" onClick={() => toggleWishlist(product.id)}>
            {isWishlisted ? '❤️' : '🤍'}
          </button>

          {/* Main photo */}
          <button className="detail-main-photo" onClick={() => setLightbox(true)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[photoIdx]} alt={product.name} />
            {pct > 0 && (
              <span className="detail-discount-float">-{pct}% OFF</span>
            )}
          </button>

          {/* Thumbnails */}
          {photos.length > 1 && (
            <div className="detail-thumbs">
              {photos.map((url, i) => (
                <button
                  key={i}
                  className={`detail-thumb${i === photoIdx ? ' active' : ''}`}
                  onClick={() => setPhotoIdx(i)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Photo ${i + 1}`} />
                </button>
              ))}
            </div>
          )}

          {/* Dot indicators */}
          {photos.length > 1 && (
            <div className="detail-dots">
              {photos.map((_, i) => (
                <button
                  key={i}
                  className={`detail-dot${i === photoIdx ? ' active' : ''}`}
                  onClick={() => setPhotoIdx(i)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Emoji fallback */
        <div className="detail-img-wrap" style={bgStyle}>
          <button className="detail-back" onClick={() => router.back()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <button className="detail-wishlist" onClick={() => toggleWishlist(product.id)}>
            {isWishlisted ? '❤️' : '🤍'}
          </button>
          <span style={{ fontSize: '7rem' }}>{product.icon}</span>
          {pct > 0 && (
            <span style={{ position:'absolute', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--danger)', color:'white', fontSize:'.72rem', fontWeight:700, padding:'3px 10px', borderRadius:99 }}>
              -{pct}% OFF
            </span>
          )}
        </div>
      )}

      {/* ── Product info ─── */}
      <div className="detail-body">
        <div className="detail-category">
          {cat?.icon} {cat?.name ?? product.category}
          {subCat && <span style={{ color:'var(--text-muted)' }}> › {subCat.icon} {subCat.name}</span>}
        </div>
        <h1 className="detail-name">{product.name}</h1>
        {product.brand && (
          <div style={{ fontSize:'.82rem', color:'var(--text-muted)', marginBottom:6 }}>
            by <strong>{product.brand}</strong>
          </div>
        )}

        <div className="detail-rating">
          <div className="stars">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="star-icon">
                {i < Math.floor(product.rating) ? '★' : i < product.rating ? '⭐' : '☆'}
              </span>
            ))}
          </div>
          <span className="detail-rating-text">
            {product.rating} ({product.reviews} reviews · {product.sold} sold)
          </span>
        </div>

        <div className="detail-price-row">
          <span className="detail-price">${product.price.toFixed(2)}</span>
          {product.originalPrice > product.price && (
            <span className="detail-orig">${product.originalPrice.toFixed(2)}</span>
          )}
          {pct > 0 && <span className="detail-discount-badge">-{pct}%</span>}
        </div>

        <p className="detail-desc">{product.description}</p>

        {/* Feature tags */}
        {product.tags && product.tags.length > 0 && (
          <div className="claim-tags-row" style={{ marginBottom: 14 }}>
            {product.tags.map(t => (
              <span key={t} className="claim-tag">{t}</span>
            ))}
          </div>
        )}

        {/* Barcode */}
        {product.barcode && (
          <div style={{ fontSize:'.76rem', color:'var(--text-muted)', marginBottom:12, fontFamily:'monospace' }}>
            🔢 {product.barcode}
          </div>
        )}

        <div className="detail-meta">
          <span className="meta-chip">SKU: {product.sku}</span>
          <span className={`meta-chip ${stock === 0 ? 'stock-danger' : stock <= 10 ? 'stock-warn' : 'stock-ok'}`}>
            {stock === 0 ? '❌ Out of Stock' : stock <= 10 ? `⚠️ Only ${stock} left` : `✓ ${stock} in stock`}
          </span>
          {supplier && (
            <button
              className="meta-chip"
              style={{ cursor:'pointer', color:'var(--primary)', fontWeight:600 }}
              onClick={() => router.push(`/supplier/${supplier.id}`)}
            >
              🏭 {supplier.name}
              {supplier.verified && ' ✓'}
            </button>
          )}
        </div>

        {stock > 0 && (
          <div className="detail-qty">
            <span className="detail-qty-label">Quantity</span>
            <div className="detail-qty-control">
              <button className="dqty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <span className="dqty-val">{qty}</span>
              <button className="dqty-btn" onClick={() => setQty(q => Math.min(stock, q + 1))}>+</button>
            </div>
          </div>
        )}

        <div className="detail-cta">
          <button className="btn btn-outline btn-lg" disabled={stock === 0}
            onClick={() => addToCart(product.id, qty)}>
            Add to Cart
          </button>
          <button className="btn btn-primary btn-lg" disabled={stock === 0}
            onClick={() => { addToCart(product.id, qty); router.push('/checkout'); }}>
            Buy Now
          </button>
        </div>
      </div>

      {/* ── Reviews ─── */}
      <div className="review-section">
        <div className="review-section-header">
          <div className="review-section-title">
            ⭐ Reviews ({reviews.length})
          </div>
          {reviews.length > 0 && (
            <div className="review-avg">
              {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)} / 5
            </div>
          )}
        </div>

        {/* Write a review */}
        {user && !myExistingReview && (
          <div className="review-write-box">
            <div className="review-write-title">Write a Review</div>
            <div className="review-stars-row">
              {[1,2,3,4,5].map(n => (
                <button key={n} className={`review-star-btn${myRating >= n ? ' active' : ''}`}
                  onClick={() => setMyRating(n)}>★</button>
              ))}
              {myRating > 0 && <span className="review-rating-label">{['','Poor','Fair','Good','Great','Excellent'][myRating]}</span>}
            </div>
            <textarea
              className="form-input"
              rows={2}
              style={{ resize:'vertical', fontFamily:'inherit', marginTop:8 }}
              placeholder="Share your experience (optional)…"
              value={myComment}
              onChange={e => setMyComment(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 8 }}
              onClick={submitReview}
              disabled={!myRating || reviewLoading}
            >
              {reviewLoading ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        )}
        {user && myExistingReview && (
          <div className="review-my-badge">
            ✓ You reviewed this product — {['','★','★★','★★★','★★★★','★★★★★'][myExistingReview.rating]}
          </div>
        )}
        {!user && (
          <div className="review-signin-prompt">
            <button className="btn btn-ghost btn-sm" onClick={() => router.push('/auth/login')}>
              Sign in to write a review
            </button>
          </div>
        )}

        {/* Reviews list */}
        {reviewsLoaded && reviews.length === 0 && (
          <div className="review-empty">No reviews yet — be the first!</div>
        )}
        <div className="review-list">
          {reviews.map(r => (
            <div key={r.id} className="review-card">
              <div className="review-card-header">
                <span className="review-avatar">{r.userAvatar}</span>
                <div>
                  <div className="review-user-name">{r.userName}</div>
                  <div className="review-date">
                    {new Date(r.createdAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                  </div>
                </div>
                <div className="review-rating-stars">
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                </div>
              </div>
              {r.comment && <div className="review-comment">{r.comment}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Similar products ─── */}
      {similar.length > 0 && (
        <div className="similar-section">
          <div className="section-header" style={{ padding:'20px 0 12px' }}>
            <span className="section-title">Similar Products</span>
          </div>
          <div className="similar-scroll">
            {similar.map(p => (
              <div key={p.id} className="similar-card" onClick={() => { router.push(`/product/${p.id}`); setPhotoIdx(0); }}>
                {p.imageUrls?.[0] || p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrls?.[0] ?? p.imageUrl!}
                    alt={p.name}
                    className="similar-photo"
                  />
                ) : (
                  <div className="similar-img">{p.icon}</div>
                )}
                <div className="similar-body">
                  <div className="similar-name">{p.name}</div>
                  <div className="similar-price">${p.price.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Lightbox ─── */}
      {lightbox && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightbox(false)}
        >
          <button className="lightbox-close" onClick={() => setLightbox(false)}>✕</button>
          {photos.length > 1 && (
            <button className="lightbox-prev"
              onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i - 1 + photos.length) % photos.length); }}>
              ‹
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[photoIdx]}
            alt={product.name}
            className="lightbox-img"
            onClick={e => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <button className="lightbox-next"
              onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i + 1) % photos.length); }}>
              ›
            </button>
          )}
          {photos.length > 1 && (
            <div className="lightbox-counter">{photoIdx + 1} / {photos.length}</div>
          )}
        </div>
      )}
    </div>
  );
}
