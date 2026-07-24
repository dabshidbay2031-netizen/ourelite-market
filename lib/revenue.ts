/**
 * Revenue rules.
 *
 * Deleted orders are NEVER removed from the database — they stay in the
 * history labeled "Deleted" — but their money must not count toward any
 * daily/monthly/total revenue figure. Cancelled and refunded orders are
 * excluded for the same reason: that money was never (or no longer) earned.
 */
export const NON_REVENUE_STATUSES = new Set(['deleted', 'cancelled', 'refunded']);

export function isRevenueOrder(o: { status?: string | null }): boolean {
  return !NON_REVENUE_STATUSES.has(String(o.status ?? ''));
}

/**
 * Sales channel of an order:
 *   • 'pos'    — rung up at a physical register (carries a POS session /
 *                cashier). This is the store's IN-STORE / offline sale.
 *   • 'online' — placed through web checkout (no register session).
 * Used to split the dashboard into Online vs In-store performance.
 */
export type SalesChannel = 'online' | 'pos';

export function orderChannel(o: { sessionId?: string | null; cashierName?: string | null }): SalesChannel {
  return (o.sessionId != null && o.sessionId !== '') || (o.cashierName != null && o.cashierName !== '')
    ? 'pos'
    : 'online';
}

/** Sum of `total` over revenue-counting orders only. */
export function sumRevenue(orders: Array<{ status?: string | null; total?: number | string | null }>): number {
  return orders.reduce(
    (sum, o) => (isRevenueOrder(o) ? sum + (Number(o.total) || 0) : sum),
    0,
  );
}
