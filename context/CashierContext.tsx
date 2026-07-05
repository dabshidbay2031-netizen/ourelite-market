'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
  logoutCashier:  () => void;
}

const CashierContext = createContext<CashierContextValue | null>(null);

export function CashierProvider({ children }: { children: React.ReactNode }) {
  const [cashier, setCashier]             = useState<CashierSession | null>(null);
  const [cashierLoading, setCashierLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setCashier(JSON.parse(raw) as CashierSession);
    } catch { /* ignore */ }
    setCashierLoading(false);
  }, []);

  const loginAsCashier = useCallback((session: CashierSession) => {
    setCashier(session);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage full */ }
  }, []);

  const logoutCashier = useCallback(() => {
    setCashier(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <CashierContext.Provider value={{ cashier, cashierLoading, loginAsCashier, logoutCashier }}>
      {children}
    </CashierContext.Provider>
  );
}

export function useCashier() {
  const ctx = useContext(CashierContext);
  if (!ctx) throw new Error('useCashier must be inside CashierProvider');
  return ctx;
}
