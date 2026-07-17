'use client';

import { useParams, useRouter } from '@/lib/hashRouter';
import SupplierProfilePage from '@/views/SupplierProfileView';

// Paths that can never be seller storefront slugs
const RESERVED = new Set([
  'orders','profile','checkout','search','auth','api','chat','billing',
  'customers','dashboard','inventory','notifications','pos','my-dashboard',
  'product','settings','supplier','suppliers','admin','staff','cashier-login',
  'privacy','terms','wishlist',
]);

/**
 * #/:slug — seller storefront at a CLEAN url (also the app's not-found fallback).
 *
 * The store renders IN PLACE so the address stays `/#/store-name` (or the
 * top-level `hamarmall.com/store-name`). It used to redirect to
 * `/#/supplier/<id>`, which is what made storefront links show the ugly
 * `/supplier/23` instead of the store's own name.
 */
export default function SlugView() {
  const { slug } = useParams<{ slug: string }>();
  const router   = useRouter();
  const s = (slug ?? '').trim().toLowerCase();

  if (s && !RESERVED.has(s)) {
    // SupplierProfilePage resolves the store by slug and shows its own
    // "Business not found" if the slug matches nothing.
    return <SupplierProfilePage slug={s} />;
  }

  return (
    <div className="empty-state" style={{ marginTop: 80 }}>
      <div className="empty-icon">🔍</div>
      <div className="empty-title">Page not found</div>
      <div className="empty-sub">This link does not match any page or store</div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.replace('/')}>
        Back to shop
      </button>
    </div>
  );
}
