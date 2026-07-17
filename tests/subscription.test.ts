import { describe, it, expect } from 'vitest';
import {
  deriveSubscription, planForAccountType, priceForAccountType,
  SUBSCRIPTION_PRICES, SUBSCRIPTION_TRIAL_DAYS,
} from '@/lib/subscription';

const DAY = 86_400_000;
const NOW = new Date('2026-07-16T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('pricing', () => {
  it('charges suppliers $24.99 and businesses $14.99', () => {
    expect(SUBSCRIPTION_PRICES.supplier).toBe(24.99);
    expect(SUBSCRIPTION_PRICES.business).toBe(14.99);
    expect(priceForAccountType('supplier')).toBe(24.99);
    expect(priceForAccountType('business')).toBe(14.99);
  });

  it('never bills agents or customers', () => {
    expect(planForAccountType('agent')).toBeNull();
    expect(planForAccountType('user')).toBeNull();
    expect(priceForAccountType('agent')).toBeNull();
  });
});

describe('deriveSubscription — locking', () => {
  it('locks a business that has never paid', () => {
    const s = deriveSubscription({ accountType: 'business', subscriptionPaidAt: null }, NOW);
    expect(s.status).toBe('unpaid');
    expect(s.locked).toBe(true);
    expect(s.price).toBe(14.99);
  });

  it('locks a supplier that has never paid', () => {
    const s = deriveSubscription({ accountType: 'supplier', subscriptionPaidAt: null }, NOW);
    expect(s.locked).toBe(true);
    expect(s.price).toBe(24.99);
  });

  it('never locks an agent', () => {
    const s = deriveSubscription({ accountType: 'agent', subscriptionPaidAt: null }, NOW);
    expect(s.locked).toBe(false);
    expect(s.requiresSubscription).toBe(false);
  });

  it('never locks anyone before the billing migration has run', () => {
    // The columns don't exist yet → must not be read as "unpaid".
    const s = deriveSubscription(
      { accountType: 'business', subscriptionPaidAt: null, billingEnabled: false }, NOW);
    expect(s.locked).toBe(false);
    expect(s.requiresSubscription).toBe(false);
  });

  it('locks again after a refund', () => {
    const s = deriveSubscription(
      { accountType: 'business', subscriptionPaidAt: ago(2), subscriptionRefundedAt: ago(1) }, NOW);
    expect(s.status).toBe('refunded');
    expect(s.locked).toBe(true);
    expect(s.refundable).toBe(false);
  });
});

describe('deriveSubscription — 7-day money-back window', () => {
  it('is refundable immediately after paying', () => {
    const s = deriveSubscription({ accountType: 'business', subscriptionPaidAt: ago(0) }, NOW);
    expect(s.status).toBe('refundable');
    expect(s.locked).toBe(false);
    expect(s.refundable).toBe(true);
    expect(s.daysLeftToRefund).toBe(SUBSCRIPTION_TRIAL_DAYS);
  });

  it('is still refundable on day 6 and reports days left', () => {
    const s = deriveSubscription({ accountType: 'supplier', subscriptionPaidAt: ago(6) }, NOW);
    expect(s.refundable).toBe(true);
    expect(s.daysLeftToRefund).toBe(1);
  });

  it('is NOT refundable once 7 days have passed — active but locked-in', () => {
    const s = deriveSubscription({ accountType: 'business', subscriptionPaidAt: ago(7) }, NOW);
    expect(s.status).toBe('active');
    expect(s.refundable).toBe(false);
    expect(s.locked).toBe(false);          // still has access — just no refund
    expect(s.daysLeftToRefund).toBe(0);
  });

  it('is not refundable long after the window (grandfathered stores)', () => {
    const s = deriveSubscription({ accountType: 'business', subscriptionPaidAt: ago(400) }, NOW);
    expect(s.status).toBe('active');
    expect(s.refundable).toBe(false);
    expect(s.locked).toBe(false);
  });

  it('sets the refund deadline exactly 7 days after payment', () => {
    const paidAt = ago(1);
    const s = deriveSubscription({ accountType: 'business', subscriptionPaidAt: paidAt }, NOW);
    expect(new Date(s.refundDeadline!).getTime())
      .toBe(new Date(paidAt).getTime() + SUBSCRIPTION_TRIAL_DAYS * DAY);
  });

  it('treats the boundary (exactly 7 days, to the ms) as expired', () => {
    const paidAt = new Date(NOW.getTime() - SUBSCRIPTION_TRIAL_DAYS * DAY).toISOString();
    const s = deriveSubscription({ accountType: 'business', subscriptionPaidAt: paidAt }, NOW);
    expect(s.refundable).toBe(false);
  });
});
