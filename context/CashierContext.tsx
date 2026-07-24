'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { mergeCashierSession, CASHIER_SESSION_KEY, type CashierSessionSnapshot } from '@/lib/cashierSession';

const SESSION_KEY = CASHIER_SESSION_KEY;

export interface CashierSession {
  id:         string;
  name:       string;
  phone:      string;
  businessId: string;
  privileges: string[];
  loginAt:    string;
  /** Signed API credential (X-Cashier-Token). Staff have no Supabase JWT. */
  token?:     string;
}

interface CashierContextValue {
  cashier:        CashierSession | null;
  cashierLoading: boolean;
  loginAsCashier: (session: CashierSession) => void;
  updateCashierSession: (updates: Partial<CashierSession>) => void;
  logoutCashier:  () => void;
}

const CashierContext = createContext<CashierContextValue | null>(null);

export function CashierProvider({ children }: { children: React.ReactNode }) {
  const [cashier, setCashier]             = useState<CashierSession | null>(null);
  const [cashierLoading, setCashierLoading] = useState(true);

  const persistCashier = useCallback((session: CashierSession | null) => {
    if (session) {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage full */ }
    } else {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setCashier(JSON.parse(raw) as CashierSession);
    } catch { /* ignore */ }
    setCashierLoading(false);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_KEY) return;
      if (!event.newValue) { setCashier(null); return; }
      try { setCashier(JSON.parse(event.newValue) as CashierSession); } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const loginAsCashier = useCallback((session: CashierSession) => {
    setCashier(session);
    persistCashier(session);
  }, [persistCashier]);

  const updateCashierSession = useCallback((updates: Partial<CashierSession>) => {
    setCashier(prev => {
      const merged = mergeCashierSession(prev as CashierSessionSnapshot | null, updates as Partial<CashierSessionSnapshot>);
      persistCashier(merged as CashierSession | null);
      return merged as CashierSession | null;
    });
  }, [persistCashier]);

  const logoutCashier = useCallback(() => {
    setCashier(null);
    persistCashier(null);
  }, [persistCashier]);

  /**
   * Live privilege sync — poll the server for this cashier's current row so an
   * owner's change (new/removed privileges, or deactivation) takes effect
   * WITHOUT the staff member logging out and back in. A 401 means the account
   * was deactivated (or the token is void) → sign them out immediately.
   */
  useEffect(() => {
    const token = cashier?.token;
    if (!token) return;

    let stopped = false;
    const sync = async () => {
      try {
        const res = await fetch('/api/cashiers/me', { headers: { 'X-Cashier-Token': token }, cache: 'no-store' });
        if (stopped) return;
        if (res.status === 401) { logoutCashier(); return; }
        if (!res.ok) return;
        const me = await res.json();
        const next = Array.isArray(me.privileges) ? me.privileges : [];
        setCashier(prev => {
          if (!prev) return prev;
          // Only rewrite (and re-persist) when something actually changed.
          const same = prev.name === me.name
            && JSON.stringify(prev.privileges) === JSON.stringify(next);
          if (same) return prev;
          const merged = { ...prev, name: me.name ?? prev.name, privileges: next };
          persistCashier(merged);
          return merged;
        });
      } catch { /* offline — keep the last known privileges */ }
    };

    sync(); // immediately on login/mount
    const id = setInterval(sync, 30000);
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    return () => { stopped = true; clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [cashier?.token, logoutCashier, persistCashier]);

  return (
    <CashierContext.Provider value={{ cashier, cashierLoading, loginAsCashier, updateCashierSession, logoutCashier }}>
      {children}
    </CashierContext.Provider>
  );
}

export function useCashier() {
  const ctx = useContext(CashierContext);
  if (!ctx) throw new Error('useCashier must be inside CashierProvider');
  return ctx;
}
