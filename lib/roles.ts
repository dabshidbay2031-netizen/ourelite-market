import type { AccountType } from '@/lib/types';

/**
 * Audience roles, derived from auth state:
 *  - guest:    not signed in — can browse and shop
 *  - customer: signed-in consumer ('user' account, or no account record yet)
 *  - business: business account — store operations (POS, inventory, sourcing)
 *  - supplier: wholesale seller — manages their catalog via Profile
 */
export type Role = 'guest' | 'customer' | 'business' | 'supplier';

export function roleFor(signedIn: boolean, accountType: AccountType | null): Role {
  if (!signedIn) return 'guest';
  if (accountType === 'business') return 'business';
  if (accountType === 'supplier') return 'supplier';
  return 'customer';
}

/** Store-operations pages — businesses only. Everything else is shared.
 *  NOTE: '/admin' is deliberately NOT here — platform admins are often plain
 *  (non-business) accounts, and AdminDashboard does its own role gating via
 *  /api/admin/check. Its Access-Denied page also shows the visitor's UID,
 *  which the Team → Add Member flow depends on. */
const BUSINESS_PREFIXES = ['/dashboard', '/my-dashboard', '/pos', '/inventory', '/customers', '/suppliers', '/staff'];

export function isBusinessRoute(path: string): boolean {
  return BUSINESS_PREFIXES.some(p => path === p || path.startsWith(`${p}/`));
}

export function canAccess(role: Role, path: string): boolean {
  if (isBusinessRoute(path)) return role === 'business';
  return true;
}
