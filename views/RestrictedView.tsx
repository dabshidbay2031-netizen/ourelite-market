'use client';

import { Link, useRouter } from '@/lib/hashRouter';
import type { Role } from '@/lib/roles';

/**
 * Shown when a customer / supplier / guest opens a business-only page
 * (dashboard, POS, inventory, customers, suppliers, admin).
 */
export default function RestrictedView({ role }: { role: Role }) {
  const router = useRouter();

  return (
    <div className="empty-state" style={{ marginTop: 80 }}>
      <div className="empty-icon">🔒</div>
      <div className="empty-title">Business area</div>
      <div className="empty-sub">
        {role === 'guest'
          ? 'Sign in with a business account to manage your store'
          : role === 'supplier'
            ? 'This page is for store owners — manage your products from your supplier profile'
            : 'This page is only available to business accounts'}
      </div>

      {role === 'guest' ? (
        <Link href="/auth/login" className="btn btn-primary" style={{ marginTop: 16 }}>
          Sign In
        </Link>
      ) : role === 'supplier' ? (
        <Link href="/profile" className="btn btn-primary" style={{ marginTop: 16 }}>
          My Supplier Profile
        </Link>
      ) : (
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.replace('/')}>
          Back to Shop
        </button>
      )}
    </div>
  );
}
