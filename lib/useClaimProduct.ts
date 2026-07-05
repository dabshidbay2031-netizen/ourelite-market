'use client';

import { useCallback, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useMyProductIds } from '@/lib/useMyProductIds';

/**
 * One-click "Add to my store" (claim) for a business browsing the catalog.
 *
 * A business sources products from the shared catalog via `business_products`
 * (the claim model). This hook exposes a single-tap claim that:
 *   • starts the product at the catalog price with 0 stock (the store then
 *     sets its own price/stock in Inventory) — nothing destructive, no modal,
 *   • is idempotent — a product already in the store just says so,
 *   • refreshes the in-memory claim map so the button flips to "In your store".
 *
 * Only real business accounts see this (`canClaim`); wholesalers/customers/admins
 * don't get the claim affordance on cards.
 */
export function useClaimProduct() {
  const { toast, state } = useApp();
  const { accountType } = useAuth();
  const { ids, supplierId, refresh, ready } = useMyProductIds();
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const canClaim = accountType === 'business' && supplierId != null;

  /** Is this product already in the current store (owned or claimed)? */
  const isMine = useCallback((productId: number) => ids.has(productId), [ids]);

  const claim = useCallback(async (productId: number) => {
    if (supplierId == null) { toast('Sign in as a store to add products', 'error'); return; }
    if (ids.has(productId)) { toast('Already in your store', 'default'); return; }

    const product = state.products.find(p => p.id === productId);
    setClaimingId(productId);
    try {
      const res = await fetch('/api/business-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supplierId,
          productId,
          customPrice: product?.price ?? 0,  // start at catalog price
          stockQty:    0,                      // store sets real stock in Inventory
          moq:         1,
        }),
      });
      if (res.ok) {
        toast(product ? `✅ "${product.name}" added to your store` : 'Added to your store ✓', 'success');
        refresh();
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.error ?? 'Could not add to your store', 'error');
      }
    } catch {
      toast('Network error — please try again', 'error');
    } finally {
      setClaimingId(null);
    }
  }, [supplierId, ids, state.products, toast, refresh]);

  return { canClaim, ready, claim, isMine, claimingId };
}
