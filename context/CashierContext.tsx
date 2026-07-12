'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { mergeCashierSession, type CashierSessionSnapshot } from '@/lib/cashierSession';

const SESSION_KEY = 'mg_cashier_session';

export interface CashierSession {
  id:         string;
  name:       string;
  phone:      string;
  businessId: string;
  privileges: string[];
  loginAt:    string;
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
