/**
 * Navigation components — role-based visibility and the mobile drawer.
 *
 * Auth/App contexts are mocked so each test can pick a role without
 * touching Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { HashRouterProvider } from '@/lib/hashRouter';
import type { AccountType } from '@/lib/types';

/* ── Context mocks ───────────────────────────────────────────── */

let mockUser: { id: string } | null = null;
let mockAccountType: AccountType | null = null;
let mockCashier: { name: string; privileges: string[] } | null = null;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    accountType: mockAccountType,
    loading: false,
    currentSupplier: null,
    currentProfile: null,
  }),
}));

vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    unreadCount: () => 2,
    cartCount: () => 3,
    setCartOpen: vi.fn(),
  }),
}));

vi.mock('@/context/CashierContext', () => ({
  useCashier: () => ({ cashier: mockCashier, cashierLoading: false, logoutCashier: vi.fn() }),
}));

import BottomNav from '@/components/BottomNav';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import RestrictedView from '@/views/RestrictedView';

function asRole(role: 'guest' | 'customer' | 'business' | 'supplier') {
  mockUser        = role === 'guest' ? null : { id: 'u1' };
  mockAccountType = role === 'business' ? 'business'
                  : role === 'supplier' ? 'supplier'
                  : role === 'customer' ? 'user'
                  : null;
}

const wrap = (ui: React.ReactNode) => render(<HashRouterProvider>{ui}</HashRouterProvider>);

beforeEach(() => { asRole('guest'); mockCashier = null; });

/* ── BottomNav ───────────────────────────────────────────────── */

describe('BottomNav role slots', () => {
  it('business sees POS', () => {
    asRole('business');
    wrap(<BottomNav />);
    expect(screen.getByText('POS')).toBeInTheDocument();
    expect(screen.queryByText('Orders')).not.toBeInTheDocument();
  });

  it.each(['guest', 'customer', 'supplier'] as const)('%s sees Orders instead of POS', (role) => {
    asRole(role);
    wrap(<BottomNav />);
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.queryByText('POS')).not.toBeInTheDocument();
  });

  it('guest sees Login, signed-in sees Profile', () => {
    wrap(<BottomNav />);
    expect(screen.getByText('Login')).toBeInTheDocument();

    asRole('customer');
    wrap(<BottomNav />);
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});

/* ── Sidebar ─────────────────────────────────────────────────── */

const BUSINESS_LABELS = ['Dashboard', 'Point of Sale', 'Inventory', 'Suppliers', 'Customers'];

describe('Sidebar role filtering', () => {
  it('business sees all store-operations links', () => {
    asRole('business');
    wrap(<Sidebar />);
    for (const label of BUSINESS_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each(['guest', 'customer', 'supplier'] as const)(
    '%s sees NO store-operations links', (role) => {
      asRole(role);
      wrap(<Sidebar />);
      for (const label of BUSINESS_LABELS) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
      // Shared links stay visible
      expect(screen.getByText('Explore')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
});

/* ── Header mobile drawer ────────────────────────────────────── */

describe('Header mobile drawer', () => {
  it('opens on hamburger tap: slides in, shows overlay, locks scroll', () => {
    wrap(<Header showSearch={false} />);
    const drawer = document.querySelector('.mobile-menu')!;
    expect(drawer).not.toHaveClass('open');

    act(() => { screen.getByLabelText('Open menu').click(); });

    expect(drawer).toHaveClass('open');
    expect(document.querySelector('.overlay')).toHaveClass('show');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes via the ✕ button and unlocks scroll', () => {
    wrap(<Header showSearch={false} />);
    act(() => { screen.getByLabelText('Open menu').click(); });
    act(() => { screen.getByLabelText('Close menu').click(); });

    expect(document.querySelector('.mobile-menu')).not.toHaveClass('open');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes when the overlay is tapped', () => {
    wrap(<Header showSearch={false} />);
    act(() => { screen.getByLabelText('Open menu').click(); });
    act(() => { (document.querySelector('.overlay') as HTMLElement).click(); });
    expect(document.querySelector('.mobile-menu')).not.toHaveClass('open');
  });

  it('drawer hides business links for customers', () => {
    asRole('customer');
    wrap(<Header showSearch={false} />);
    act(() => { screen.getByLabelText('Open menu').click(); });

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Stock')).not.toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('drawer shows business links for businesses', () => {
    asRole('business');
    wrap(<Header showSearch={false} />);
    act(() => { screen.getByLabelText('Open menu').click(); });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Stock')).toBeInTheDocument();
    expect(screen.getByText('Suppliers')).toBeInTheDocument();
  });

  it('drawer footer: guest → Sign In, signed-in → My Profile', () => {
    wrap(<Header showSearch={false} />);
    expect(screen.getByText('Sign In')).toBeInTheDocument();

    asRole('customer');
    wrap(<Header showSearch={false} />);
    expect(screen.getByText('My Profile')).toBeInTheDocument();
  });
});

/* ── Cashier sessions — privilege-scoped nav, not blanket business access ──
 * Regression coverage: a cashier used to see every business-operations link
 * no matter what privileges they were granted (the role was just "business"
 * for any cashier, ignoring cashier.privileges entirely). */

describe('Sidebar cashier privilege filtering', () => {
  it('a cashier with only "pos" sees POS but none of the other store-operations links', () => {
    mockCashier = { name: 'Amina', privileges: ['pos'] };
    wrap(<Sidebar />);
    expect(screen.getByText('Point of Sale')).toBeInTheDocument();
    for (const label of ['Dashboard', 'Inventory', 'Suppliers', 'Customers', 'Staff', 'Orders']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.getByText('Logged in as')).toBeInTheDocument();
    expect(screen.getByText('Amina')).toBeInTheDocument();
  });

  it('a cashier with pos + customers sees exactly those two store-operations links', () => {
    mockCashier = { name: 'Amina', privileges: ['pos', 'customers'] };
    wrap(<Sidebar />);
    expect(screen.getByText('Point of Sale')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    for (const label of ['Dashboard', 'Inventory', 'Suppliers', 'Staff']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('a lingering owner Supabase session does not override a cashier\'s narrower privileges', () => {
    asRole('business');
    mockCashier = { name: 'Amina', privileges: ['pos'] };
    wrap(<Sidebar />);
    expect(screen.getByText('Point of Sale')).toBeInTheDocument();
    expect(screen.queryByText('Staff')).not.toBeInTheDocument();
    expect(screen.queryByText('Suppliers')).not.toBeInTheDocument();
  });
});

describe('BottomNav cashier privilege filtering', () => {
  it('a cashier without "pos" sees Orders instead of POS', () => {
    mockCashier = { name: 'Amina', privileges: ['orders'] };
    wrap(<BottomNav />);
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.queryByText('POS')).not.toBeInTheDocument();
  });

  it('a cashier session shows Log Out instead of Login/Profile', () => {
    mockCashier = { name: 'Amina', privileges: ['pos'] };
    wrap(<BottomNav />);
    expect(screen.getByText('Log Out')).toBeInTheDocument();
  });
});

/* ── RestrictedView ──────────────────────────────────────────── */

describe('RestrictedView', () => {
  it('guest gets a Sign In call-to-action', () => {
    wrap(<RestrictedView role="guest" />);
    expect(screen.getByText('Business area')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toHaveAttribute('href', '#/auth/login');
  });

  it('supplier is pointed to their supplier profile', () => {
    wrap(<RestrictedView role="supplier" />);
    expect(screen.getByText('My Supplier Profile')).toHaveAttribute('href', '#/profile');
  });

  it('customer gets Back to Shop', () => {
    wrap(<RestrictedView role="customer" />);
    expect(screen.getByText('Back to Shop')).toBeInTheDocument();
  });
});
