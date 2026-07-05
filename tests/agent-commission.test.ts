// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  COMMISSION, TIERS, currentTier, nextTier, tierProgress, computeCommission,
} from '@/lib/agentCommission';

describe('agent commission tiers', () => {
  it('starts at Bronze with zero registrations', () => {
    expect(currentTier(0).name).toBe('Bronze');
    expect(nextTier(0)?.name).toBe('Silver');
  });

  it('promotes exactly at each threshold', () => {
    expect(currentTier(49).name).toBe('Bronze');
    expect(currentTier(50).name).toBe('Silver');
    expect(currentTier(150).name).toBe('Gold');
    expect(currentTier(400).name).toBe('Platinum');
  });

  it('has no next tier at the top', () => {
    expect(nextTier(400)).toBeNull();
    expect(nextTier(99999)).toBeNull();
  });

  it('reports progress through the current tier', () => {
    // 100 regs: Silver(50) → Gold(150), halfway
    const p = tierProgress(100);
    expect(p.current.name).toBe('Silver');
    expect(p.next?.name).toBe('Gold');
    expect(p.toNext).toBe(50);
    expect(p.pct).toBe(50);
  });

  it('caps progress at 100% for the top tier', () => {
    const p = tierProgress(1000);
    expect(p.next).toBeNull();
    expect(p.pct).toBe(100);
    expect(p.toNext).toBe(0);
  });
});

describe('agent commission payout', () => {
  it('pays nothing with no activity', () => {
    expect(computeCommission({ productsRegistered: 0, storesReached: 0 }).total).toBe(0);
  });

  it('pays the per-registration bounty', () => {
    const b = computeCommission({ productsRegistered: 10, storesReached: 0 });
    expect(b.registration).toBe(10 * COMMISSION.perRegistration);
    expect(b.adoption).toBe(0);
    expect(b.milestone).toBe(0);
  });

  it('adds adoption bonus per store reached', () => {
    const b = computeCommission({ productsRegistered: 0, storesReached: 3 });
    expect(b.adoption).toBe(3 * COMMISSION.perStoreReached);
  });

  it('accumulates every milestone bonus reached', () => {
    // 200 regs clears Bronze(0)+Silver(50)+Gold(150) bonuses, not Platinum(400)
    const b = computeCommission({ productsRegistered: 200, storesReached: 0 });
    const expected = TIERS.filter(t => 200 >= t.min).reduce((s, t) => s + t.bonus, 0);
    expect(b.milestone).toBe(expected);
    expect(b.milestone).toBe(0 + 50 + 200);
  });

  it('sums all sources into the total', () => {
    const b = computeCommission({ productsRegistered: 60, storesReached: 2 });
    expect(b.total).toBe(b.registration + b.adoption + b.milestone);
    expect(b.total).toBe(60 * 2 + 2 * 5 + (0 + 50)); // Silver reached
  });

  it('never goes negative on bad input', () => {
    expect(computeCommission({ productsRegistered: -5, storesReached: -3 }).total).toBe(0);
  });
});
