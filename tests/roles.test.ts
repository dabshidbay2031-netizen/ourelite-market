/**
 * Role system — who counts as what, and which routes are business-only.
 */
import { describe, it, expect } from 'vitest';
import { roleFor, isBusinessRoute, canAccess, type Role } from '@/lib/roles';

describe('roleFor', () => {
  it('signed out → guest, regardless of account type', () => {
    expect(roleFor(false, null)).toBe('guest');
    expect(roleFor(false, 'business')).toBe('guest');
  });

  it('signed in without an account record → customer', () => {
    expect(roleFor(true, null)).toBe('customer');
  });

  it('signed in as plain user → customer', () => {
    expect(roleFor(true, 'user')).toBe('customer');
  });

  it('business account → business', () => {
    expect(roleFor(true, 'business')).toBe('business');
  });

  it('supplier account → supplier', () => {
    expect(roleFor(true, 'supplier')).toBe('supplier');
  });
});

describe('isBusinessRoute', () => {
  it.each(['/dashboard', '/my-dashboard', '/pos', '/inventory', '/customers', '/suppliers', '/staff'])(
    '%s is business-only', (path) => {
      expect(isBusinessRoute(path)).toBe(true);
    });

  it('/admin is NOT gated as a business route — platform admins are often plain accounts; AdminDashboard self-gates via /api/admin/check', () => {
    expect(isBusinessRoute('/admin')).toBe(false);
  });

  it('subpaths of business routes are business-only', () => {
    expect(isBusinessRoute('/inventory/edit')).toBe(true);
  });

  it.each(['/', '/search', '/product/3', '/checkout', '/orders', '/orders/ORD-1',
           '/chat', '/notifications', '/settings', '/profile', '/auth/login'])(
    '%s is shared', (path) => {
      expect(isBusinessRoute(path)).toBe(false);
    });

  it('the supplier STOREFRONT (/supplier/:id) is public even though /suppliers is not', () => {
    expect(isBusinessRoute('/supplier/3')).toBe(false);
    expect(isBusinessRoute('/suppliers')).toBe(true);
  });
});

describe('canAccess', () => {
  const roles: Role[] = ['guest', 'customer', 'supplier', 'business'];

  it('only business can open business routes', () => {
    for (const role of roles) {
      expect(canAccess(role, '/dashboard')).toBe(role === 'business');
      expect(canAccess(role, '/my-dashboard')).toBe(role === 'business');
      expect(canAccess(role, '/pos')).toBe(role === 'business');
    }
  });

  it('everyone can open shared routes', () => {
    for (const role of roles) {
      expect(canAccess(role, '/')).toBe(true);
      expect(canAccess(role, '/checkout')).toBe(true);
      expect(canAccess(role, '/profile')).toBe(true);
    }
  });
});
