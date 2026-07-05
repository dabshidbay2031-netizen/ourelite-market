'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from '@/lib/hashRouter';

// Paths that can never be seller storefront slugs
const RESERVED = new Set([
  'orders','profile','checkout','search','auth','api','chat',
  'customers','dashboard','inventory','notifications','pos',
  'product','settings','supplier','suppliers','admin',
]);

/**
 * #/:slug — Seller storefront shortcut (final catch-all hash route).
 * Looks up the supplier by slug and redirects to their public profile.
 * Example: /#/techvault → /#/supplier/1
 */
export default function SlugView() {
  const { slug } = useParams<{ slug: string }>();
  const router   = useRouter();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const s = (slug ?? '').toLowerCase();
    if (!s || RESERVED.has(s)) { setNotFound(true); return; }

    let cancelled = false;
    fetch(`/api/suppliers?slug=${encodeURIComponent(s)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data?.id) router.replace(`/supplier/${data.id}`);
        else setNotFound(true);
      })
      .catch(() => { if (!cancelled) setNotFound(true); });
    return () => { cancelled = true; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!notFound) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
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
