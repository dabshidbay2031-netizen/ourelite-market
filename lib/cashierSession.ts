export interface CashierSessionSnapshot {
  id: string;
  name: string;
  phone: string;
  businessId: string;
  privileges: string[];
  loginAt: string;
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
