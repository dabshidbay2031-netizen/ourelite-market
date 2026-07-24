'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCashier } from '@/context/CashierContext';
import { useApp } from '@/context/AppContext';
import type { Supplier } from '@/lib/types';

/**
 * Who is operating the store right now — the signed-in OWNER, or a STAFF
 * cashier the owner granted privileges to.
 *
 * Staff are not Supabase users, so views that gated on `user` alone showed
 * them "Sign in to view orders / chat". This resolves one identity both can
 * use:
 *   • `store`        — the supplier being operated (owner's own, or the one
 *                      the cashier logged into; cashiers.business_id is the
 *                      OWNER'S auth user id, matched to suppliers.auth_user_id)
 *   • `ownerUserId`  — the account that owns the store's data. Chat threads
 *                      belong to the owner, so staff reply on their behalf.
 *   • `can(priv)`    — owner/admin: always true; cashier: only what was granted.
 */
export interface StoreActor {
  /** True while auth/cashier state is still restoring — don't render gates yet. */
  loading:     boolean;
  /** Signed-in Supabase user (null for staff). */
  isOwner:     boolean;
  /** Operating via a cashier session. */
  isStaff:     boolean;
  /** Any store operator at all (owner with a store, or staff). */
  isOperator:  boolean;
  store:       Supplier | null;
  storeId:     number | null;
  /** The user id that owns the store's user-scoped data (chat, notifications). */
  ownerUserId: string | null;
  staffName:   string | null;
  can:         (privilege: string) => boolean;
}

export function useStoreActor(): StoreActor {
  const { user, currentSupplier, accountType, loading: authLoading } = useAuth();
  const { cashier, cashierLoading } = useCashier();
  const { state } = useApp();
  const suppliers = state.suppliers;

  return useMemo<StoreActor>(() => {
    // A cashier session governs even if a stale owner session lingers
    // (same rule the route guard uses — see GuardedApp).
    if (cashier) {
      const store = suppliers.find(s => s.authUserId === cashier.businessId) ?? null;
      const privs = cashier.privileges ?? [];
      return {
        loading:     cashierLoading,
        isOwner:     false,
        isStaff:     true,
        isOperator:  true,
        store,
        storeId:     store?.id ?? null,
        ownerUserId: cashier.businessId,
        staffName:   cashier.name,
        can:         (p: string) => privs.includes(p),
      };
    }

    const isSeller = (accountType === 'business' || accountType === 'supplier') && !!currentSupplier;
    return {
      loading:     authLoading || cashierLoading,
      isOwner:     !!user,
      isStaff:     false,
      isOperator:  isSeller,
      store:       currentSupplier ?? null,
      storeId:     currentSupplier?.id ?? null,
      ownerUserId: user?.id ?? null,
      staffName:   null,
      can:         () => true,   // the owner has every permission over their store
    };
  }, [user, currentSupplier, accountType, authLoading, cashier, cashierLoading, suppliers]);
}
