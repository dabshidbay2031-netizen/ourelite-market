/**
 * v3.7 Settings rebuild:
 *  - currency and language are FIXED information (USD / English) — the old
 *    dead dropdowns are gone
 *  - the POS section (default payment, require-name, auto-print) only shows
 *    for business/supplier accounts, and its choices persist to localStorage
 *  - account section reflects the signed-in user
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/Header', () => ({ default: () => null }));
const routerStub = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('@/lib/hashRouter', () => ({
  useRouter: () => routerStub,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authStub: any;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authStub }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ toast: vi.fn() }) }));

import SettingsPage from '@/views/SettingsView';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  authStub = { user: null, accountType: null, currentSupplier: null, signOut: vi.fn() };
});

describe('fixed currency & language', () => {
  it('shows USD and English as information, with no dropdowns to change them', () => {
    render(<SettingsPage />);
    expect(screen.getByText('$ USD')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    // the old currency/language <select>s are gone (customers have NO selects at all)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Somali Shilling/)).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Arabic/ })).not.toBeInTheDocument();
  });
});

describe('audience-specific sections', () => {
  it('signed-out: sign-in prompt, no POS section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    expect(screen.queryByText('🖥️ Point of Sale')).not.toBeInTheDocument();
  });

  it('customer: account row without POS section', () => {
    authStub = { user: { id: 'u1', email: 'me@x.com', displayName: 'Me' }, accountType: 'user', currentSupplier: null, signOut: vi.fn() };
    render(<SettingsPage />);
    expect(screen.getByText('me@x.com')).toBeInTheDocument();
    expect(screen.getByText('👤 Customer')).toBeInTheDocument();
    expect(screen.queryByText('🖥️ Point of Sale')).not.toBeInTheDocument();
  });

  it('business: store name + working POS controls', () => {
    authStub = {
      user: { id: 'b1', email: 'biz@x.com', displayName: 'Biz' },
      accountType: 'business',
      currentSupplier: { id: 27, name: 'City Care Pharmacy' },
      signOut: vi.fn(),
    };
    render(<SettingsPage />);
    expect(screen.getByText('City Care Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('🖥️ Point of Sale')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument(); // default payment
  });
});

describe('POS settings persist for the register', () => {
  beforeEach(() => {
    authStub = {
      user: { id: 'b1', email: 'biz@x.com', displayName: 'Biz' },
      accountType: 'business',
      currentSupplier: { id: 27, name: 'City Care Pharmacy' },
      signOut: vi.fn(),
    };
  });

  it('changing the default payment auto-saves to mogarenta_settings', () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'waafi' } });
    const saved = JSON.parse(localStorage.getItem('mogarenta_settings') ?? '{}');
    expect(saved.defaultPayment).toBe('waafi');
  });

  it('theme choice applies to <html> and persists', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '🌙 Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const saved = JSON.parse(localStorage.getItem('mogarenta_settings') ?? '{}');
    expect(saved.theme).toBe('dark');
  });
});
