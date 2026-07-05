/**
 * Cashier privilege gating — which routes a privilege-limited cashier can reach.
 *
 * Regression coverage for a bug where '/' in the public-prefix list combined
 * with path.startsWith() matched EVERY path, making the whole privilege
 * system a no-op (any cashier could reach any business route).
 */
import { describe, it, expect } from 'vitest';
import { cashierCanAccess, DEFAULT_PRIVILEGES } from '@/lib/cashierPrivileges';

describe('cashierCanAccess', () => {
  it('a cashier with only "pos" can reach POS but nothing else business-related', () => {
    const privileges = ['pos'];
    expect(cashierCanAccess('/pos', privileges)).toBe(true);
    expect(cashierCanAccess('/pos/anything', privileges)).toBe(true);
    expect(cashierCanAccess('/staff', privileges)).toBe(false);
    expect(cashierCanAccess('/inventory', privileges)).toBe(false);
    expect(cashierCanAccess('/customers', privileges)).toBe(false);
    expect(cashierCanAccess('/suppliers', privileges)).toBe(false);
    expect(cashierCanAccess('/settings', privileges)).toBe(false);
    expect(cashierCanAccess('/my-dashboard', privileges)).toBe(false);
    expect(cashierCanAccess('/orders', privileges)).toBe(false);
  });

  it('a cashier with no privileges at all still can\'t reach business routes', () => {
    expect(cashierCanAccess('/pos', [])).toBe(false);
    expect(cashierCanAccess('/staff', [])).toBe(false);
  });

  it.each(['/', '/search', '/product/3', '/chat', '/chat/1', '/notifications', '/auth/login', '/profile'])(
    '%s is always reachable, regardless of privileges', (path) => {
      expect(cashierCanAccess(path, [])).toBe(true);
    });

  it('only an exact "/" counts as the public root — it must not prefix-match every route', () => {
    expect(cashierCanAccess('/', [])).toBe(true);
    expect(cashierCanAccess('/staff', [])).toBe(false);
    expect(cashierCanAccess('/pos', [])).toBe(false);
  });

  it('granting a privilege unlocks exactly its mapped route (and subpaths)', () => {
    expect(cashierCanAccess('/staff', ['staff'])).toBe(true);
    expect(cashierCanAccess('/staff/edit', ['staff'])).toBe(true);
    expect(cashierCanAccess('/inventory', ['inventory'])).toBe(true);
    expect(cashierCanAccess('/customers', ['customers'])).toBe(true);
    expect(cashierCanAccess('/suppliers', ['suppliers'])).toBe(true);
    expect(cashierCanAccess('/settings', ['settings'])).toBe(true);
  });

  it('the "dashboard" privilege maps to the per-business dashboard, not the admin-only global one', () => {
    expect(cashierCanAccess('/my-dashboard', ['dashboard'])).toBe(true);
    expect(cashierCanAccess('/dashboard', ['dashboard'])).toBe(false);
  });

  it('default privileges cover POS, orders, inventory and customers but not staff/settings/suppliers', () => {
    expect(cashierCanAccess('/pos', DEFAULT_PRIVILEGES)).toBe(true);
    expect(cashierCanAccess('/orders', DEFAULT_PRIVILEGES)).toBe(true);
    expect(cashierCanAccess('/inventory', DEFAULT_PRIVILEGES)).toBe(true);
    expect(cashierCanAccess('/customers', DEFAULT_PRIVILEGES)).toBe(true);
    expect(cashierCanAccess('/staff', DEFAULT_PRIVILEGES)).toBe(false);
    expect(cashierCanAccess('/settings', DEFAULT_PRIVILEGES)).toBe(false);
    expect(cashierCanAccess('/suppliers', DEFAULT_PRIVILEGES)).toBe(false);
  });
});
