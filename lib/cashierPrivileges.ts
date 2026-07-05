export const PRIVILEGES = [
  { key: 'pos',            label: 'Point of Sale',  desc: 'Take payments and create orders',  default: true  },
  { key: 'orders',         label: 'View Orders',    desc: 'View and update order status',      default: true  },
  { key: 'inventory',      label: 'View Inventory', desc: 'See stock levels and products',     default: true  },
  { key: 'inventory_edit', label: 'Edit Inventory', desc: 'Adjust stock, add/edit products',  default: false },
  { key: 'customers',      label: 'Customers',      desc: 'View and manage customer list',     default: true  },
  { key: 'dashboard',      label: 'Dashboard',      desc: 'View revenue analytics',            default: false },
  { key: 'suppliers',      label: 'Suppliers',      desc: 'View supplier directory',           default: false },
  { key: 'settings',       label: 'Settings',       desc: 'Change store settings',             default: false },
  { key: 'staff',          label: 'Manage Staff',   desc: 'Add and manage cashier accounts',  default: false },
] as const;

export type PrivilegeKey = typeof PRIVILEGES[number]['key'];

export const DEFAULT_PRIVILEGES: string[] = PRIVILEGES.filter(p => p.default).map(p => p.key);

const PRIVILEGE_ROUTES: Record<string, string> = {
  pos:            '/pos',
  orders:         '/orders',
  inventory:      '/inventory',
  customers:      '/customers',
  dashboard:      '/my-dashboard',
  suppliers:      '/suppliers',
  settings:       '/settings',
  staff:          '/staff',
};

// Routes every cashier can reach no matter what privileges they were granted —
// general browsing/account pages, not store-operations data.
const PUBLIC_PREFIXES = ['/', '/product/', '/search', '/chat', '/notifications', '/auth/', '/profile'];

export function cashierCanAccess(path: string, privileges: string[]): boolean {
  // '/' must match the root EXACTLY — path.startsWith('/') is true for every
  // path, which previously made this check (and the whole privilege system) a no-op.
  if (PUBLIC_PREFIXES.some(p => path === p || (p !== '/' && path.startsWith(p)))) return true;
  for (const priv of privileges) {
    const base = PRIVILEGE_ROUTES[priv];
    if (base && (path === base || path.startsWith(base + '/'))) return true;
  }
  return false;
}
