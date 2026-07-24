'use client';

import { useCallback, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useMyProductIds } from '@/lib/useMyProductIds';

/**
 * One-click "Add to my store" for a business browsing the catalog.
 *
 * Adding a product COPIES it: the server creates a brand-new product row OWNED
 * by this store (its own id, price and stock). That ownership is the point —
 * opening a copied product shows THIS store as the seller, where the old claim
 * model left the row owned by the original uploader.
 *
 *   • starts at the catalog price with 0 stock (the store sets its real price
 *     and stock in Inventory) — nothing destructive, no modal,
 *   • is idempotent — a product already in the store just says so,
 *   • reloads the catalog so the new listing appears right away.
 *
 * Only real business accounts see this (`canClaim`); wholesalers/customers/admins
 * don't get the affordance on cards.
 */
export function useClaimProduct() {
  const { toast, state, reloadProducts } = useApp();
  const { accountType } = useAuth();
  const { ids, copiedSources, supplierId, refresh, ready } = useMyProductIds();
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const canClaim = accountType === 'business' && supplierId != null;

  /** Already in this store — either the row itself, or a copy this store made of it. */
  const isMine = useCallback(
    (productId: number) => ids.has(productId) || copiedSources.has(productId),
    [ids, copiedSources],
  );

  const claim = useCallback(async (productId: number) => {
    if (supplierId == null) { toast('Sign in as a store to add products', 'error'); return; }
    if (ids.has(productId) || copiedSources.has(productId)) {
      toast('Already in your store', 'default');
      return;
    }

    const product = state.products.find(p => p.id === productId);
    setClaimingId(productId);
    try {
      // Copies the catalog row into a NEW product owned by this store. The
      // server builds the copy from the source row — we only say which one.
      const res = await fetch('/api/products/copy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ supplierId, productId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        toast(
          data?.alreadyCopied ? 'Already in your store'
            : product ? `✅ "${product.name}" is now yours — set your price in Inventory`
            : 'Added to your store ✓',
          data?.alreadyCopied ? 'default' : 'success',
        );
        refresh();
        await reloadProducts().catch(() => {});
      } else {
        toast(data?.error ?? 'Could not add to your store', 'error');
      }
    } catch {
      toast('Network error — please try again', 'error');
    } finally {
      setClaimingId(null);
    }
  }, [supplierId, ids, copiedSources, state.products, toast, refresh, reloadProducts]);

  return { canClaim, ready, claim, isMine, claimingId };
}
