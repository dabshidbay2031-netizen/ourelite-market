export interface CashierSessionSnapshot {
  id: string;
  name: string;
  phone: string;
  businessId: string;
  privileges: string[];
  loginAt: string;
  /** Signed credential sent as X-Cashier-Token so staff API calls authenticate. */
  token?: string;
}

/** Where the cashier session lives in localStorage (shared by context + clientAuth). */
export const CASHIER_SESSION_KEY = 'mg_cashier_session';

/**
 * The current cashier's API token, read straight from storage.
 * Used by request helpers that can't reach React context.
 */
export function readCashierToken(): string | null {
  try {
    const raw = localStorage.getItem(CASHIER_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CashierSessionSnapshot;
    return s?.token ?? null;
  } catch { return null; }
}

export function mergeCashierSession(
  session: CashierSessionSnapshot | null,
  updates: Partial<CashierSessionSnapshot>,
): CashierSessionSnapshot | null {
  if (!session) return null;
  return {
    ...session,
    ...updates,
    privileges: updates.privileges ?? session.privileges,
  };
}
