/**
 * Seller subscription model — shared client + server (no secrets here).
 *
 * Business and supplier accounts pay a recurring-style access fee to use the
 * store dashboard. Payment is taken up-front; the first 7 days are a
 * MONEY-BACK GUARANTEE window — a full self-service refund is available any
 * time inside it, and never after. An account with no active payment is
 * "locked": it can sign in and reach billing, but the store dashboard is
 * blocked until it pays.
 *
 * Agents and customers ('user') never pay — they are not gated.
 */

export const SUBSCRIPTION_TRIAL_DAYS = 7;                // money-back window
export const SUBSCRIPTION_CURRENCY    = 'USD';
export const SUBSCRIPTION_PRICES = { supplier: 24.99, business: 14.99 } as const;

export type BillablePlan       = 'supplier' | 'business';
export type SubscriptionStatus = 'unpaid' | 'refundable' | 'active' | 'refunded';

const DAY_MS = 86_400_000;

/** The plan a given account type must pay for, or null if it never pays. */
export function planForAccountType(t?: string | null): BillablePlan | null {
  if (t === 'supplier') return 'supplier';
  if (t === 'business') return 'business';
  return null;
}

export function priceForAccountType(t?: string | null): number | null {
  const plan = planForAccountType(t);
  return plan ? SUBSCRIPTION_PRICES[plan] : null;
}

/** The subset of supplier fields the derivation reads (camelCase, as the API returns them). */
export interface SubscriptionInput {
  accountType?:             string | null;
  subscriptionPaidAt?:      string | null;
  subscriptionRefundedAt?:  string | null;
  /**
   * False when the DB has no subscription columns yet (migration_subscriptions.sql
   * not run). Without this, an absent column reads as "never paid" and would lock
   * every existing seller out. Absent/undefined = assume enabled.
   */
  billingEnabled?:          boolean;
}

export interface SubscriptionState {
  requiresSubscription: boolean;          // does this account type pay at all?
  plan:            BillablePlan | null;
  price:           number | null;
  status:          SubscriptionStatus;
  locked:          boolean;               // dashboard blocked until they pay
  refundable:      boolean;               // inside the 7-day money-back window
  paidAt:          string | null;
  refundedAt:      string | null;
  refundDeadline:  string | null;         // ISO — end of the money-back window
  daysLeftToRefund: number;               // whole days remaining (0 once past)
}

/** Pure: turn stored subscription fields into a UI/enforcement state. */
export function deriveSubscription(
  s: SubscriptionInput | null | undefined,
  now: Date = new Date(),
): SubscriptionState {
  const plan  = planForAccountType(s?.accountType);
  const price = plan ? SUBSCRIPTION_PRICES[plan] : null;

  // Billing columns not deployed yet → never lock anyone. (An absent column
  // is indistinguishable from "unpaid" on the client, so the API flags it.)
  if (s?.billingEnabled === false) {
    return {
      requiresSubscription: false, plan, price,
      status: 'active', locked: false, refundable: false,
      paidAt: null, refundedAt: null, refundDeadline: null, daysLeftToRefund: 0,
    };
  }

  // Account types that never pay (agent / user) are always unlocked.
  if (!plan) {
    return {
      requiresSubscription: false, plan: null, price: null,
      status: 'active', locked: false, refundable: false,
      paidAt: null, refundedAt: null, refundDeadline: null, daysLeftToRefund: 0,
    };
  }

  const paidAt     = s?.subscriptionPaidAt ?? null;
  const refundedAt = s?.subscriptionRefundedAt ?? null;

  // Refunded, or never paid → locked, must (re)pay.
  if (refundedAt || !paidAt) {
    return {
      requiresSubscription: true, plan, price,
      status: refundedAt ? 'refunded' : 'unpaid',
      locked: true, refundable: false,
      paidAt, refundedAt, refundDeadline: null, daysLeftToRefund: 0,
    };
  }

  const deadline = new Date(new Date(paidAt).getTime() + SUBSCRIPTION_TRIAL_DAYS * DAY_MS);
  const within   = now.getTime() < deadline.getTime();
  const daysLeft = within ? Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS) : 0;

  return {
    requiresSubscription: true, plan, price,
    status: within ? 'refundable' : 'active',
    locked: false,
    refundable: within,
    paidAt, refundedAt: null,
    refundDeadline: deadline.toISOString(),
    daysLeftToRefund: daysLeft,
  };
}

/** A friendly label for a plan. */
export function planLabel(plan: BillablePlan | null): string {
  if (plan === 'supplier') return 'Supplier';
  if (plan === 'business') return 'Business';
  return '—';
}
