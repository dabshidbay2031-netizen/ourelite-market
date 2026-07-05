'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp }  from '@/context/AppContext';

/**
 * Invisible component that syncs the wishlist from the DB when a user logs in.
 * Placed in layout so it runs on every page.
 */
export default function WishlistSync() {
  const { user }              = useAuth();
  const { loadWishlistFromDB, state, wishlistLoaded } = useApp();

  // Load DB wishlist on login
  useEffect(() => {
    if (user?.id) {
      loadWishlistFromDB(user.id);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local wishlist changes to DB when user is logged in.
  // Gated on wishlistLoaded so we never push BEFORE the DB merge (which
  // would wipe the stored wishlist) — but once loaded, empty lists DO
  // sync, so removing the last item actually persists.
  useEffect(() => {
    if (!user?.id || !wishlistLoaded) return;
    const sync = async () => {
      try {
        await fetch('/api/wishlist/sync', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ userId: user.id, productIds: state.wishlist }),
        });
      } catch { /* ignore — local state is source of truth */ }
    };
    // Debounce: only sync 2s after last change
    const timer = setTimeout(sync, 2000);
    return () => clearTimeout(timer);
  }, [user?.id, wishlistLoaded, state.wishlist]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
