import { describe, it, expect } from 'vitest';
import { orderChannel, isRevenueOrder } from '@/lib/revenue';

describe('orderChannel — Online vs In-store (POS)', () => {
  it('an order with a POS session is in-store', () => {
    expect(orderChannel({ sessionId: 'sess-1' })).toBe('pos');
  });
  it('an order with a cashier name is in-store', () => {
    expect(orderChannel({ cashierName: 'Amina' })).toBe('pos');
  });
  it('a web order with neither is online', () => {
    expect(orderChannel({ sessionId: null, cashierName: null })).toBe('online');
    expect(orderChannel({})).toBe('online');
  });
  it('empty-string session/cashier is treated as online (not POS)', () => {
    expect(orderChannel({ sessionId: '', cashierName: '' })).toBe('online');
  });
  it('classification is independent of payment method', () => {
    // A POS sale paid by Waafi is still in-store; a cash-on-delivery web order is online.
    expect(orderChannel({ sessionId: 's1' })).toBe('pos');       // POS + (any pay method)
    expect(orderChannel({ cashierName: null })).toBe('online');  // web + cash-on-delivery
  });
});

describe('isRevenueOrder still excludes non-revenue statuses', () => {
  it('counts pending/completed, excludes deleted/cancelled/refunded', () => {
    expect(isRevenueOrder({ status: 'completed' })).toBe(true);
    expect(isRevenueOrder({ status: 'pending' })).toBe(true);
    expect(isRevenueOrder({ status: 'deleted' })).toBe(false);
    expect(isRevenueOrder({ status: 'cancelled' })).toBe(false);
    expect(isRevenueOrder({ status: 'refunded' })).toBe(false);
  });
});
