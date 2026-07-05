/**
 * Trial + approval lifecycle — state machine, formatting, and the gate UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { getTrialState, formatTimeLeft, TRIAL_DURATION_MS } from '@/lib/trial';
import { HashRouterProvider } from '@/lib/hashRouter';
import type { Supplier, AccountType } from '@/lib/types';

/* ── getTrialState ───────────────────────────────────────────── */

const NOW = Date.parse('2026-06-13T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('getTrialState', () => {
  it('no supplier record → approved (feature off)', () => {
    expect(getTrialState(null, NOW).phase).toBe('approved');
  });

  it('pre-migration schema (no approvalStatus) → approved', () => {
    expect(getTrialState({ approvalStatus: null }, NOW).phase).toBe('approved');
  });

  it('approved stays approved', () => {
    expect(getTrialState({ approvalStatus: 'approved' }, NOW).phase).toBe('approved');
  });

  it('fresh trial → trial with full time left', () => {
    const s = getTrialState({ approvalStatus: 'trial', trialStartedAt: iso(0) }, NOW);
    expect(s.phase).toBe('trial');
    expect(s.msLeft).toBe(TRIAL_DURATION_MS);
  });

  it('mid-trial → counts down', () => {
    const s = getTrialState({ approvalStatus: 'trial', trialStartedAt: iso(60_000) }, NOW);
    expect(s.phase).toBe('trial');
    expect(s.msLeft).toBe(TRIAL_DURATION_MS - 60_000);
  });

  it('past the window → expired', () => {
    const s = getTrialState({ approvalStatus: 'trial', trialStartedAt: iso(TRIAL_DURATION_MS + 1000) }, NOW);
    expect(s.phase).toBe('expired');
    expect(s.msLeft).toBe(0);
  });

  it('pending and rejected pass through', () => {
    expect(getTrialState({ approvalStatus: 'pending' },  NOW).phase).toBe('pending');
    expect(getTrialState({ approvalStatus: 'rejected' }, NOW).phase).toBe('rejected');
  });
});

describe('formatTimeLeft', () => {
  it('minutes scale → m:ss', () => {
    expect(formatTimeLeft(4 * 60_000 + 32_000)).toBe('4:32');
    expect(formatTimeLeft(5_000)).toBe('0:05');
    expect(formatTimeLeft(0)).toBe('0:00');
  });

  it('hours scale → Xh Ym', () => {
    expect(formatTimeLeft(3 * 3_600_000 + 5 * 60_000)).toBe('3h 5m');
  });

  it('days scale → Xd Yh', () => {
    expect(formatTimeLeft(6 * 86_400_000 + 23 * 3_600_000)).toBe('6d 23h');
  });
});

/* ── TrialGate component ─────────────────────────────────────── */

let mockUser: { id: string } | null = { id: 'u1' };
let mockAccountType: AccountType | null = 'business';
let mockSupplier: Partial<Supplier> | null = null;
const mockRefresh = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    accountType: mockAccountType,
    currentSupplier: mockSupplier,
    loading: false,
    refreshAccount: mockRefresh,
  }),
}));

import TrialGate from '@/components/TrialGate';

function renderAt(path: string) {
  window.location.hash = `#${path}`;
  return render(
    <HashRouterProvider>
      <TrialGate><div>GATED-CONTENT</div></TrialGate>
    </HashRouterProvider>,
  );
}

beforeEach(() => {
  mockUser = { id: 'u1' };
  mockAccountType = 'business';
  mockSupplier = null;
  mockRefresh.mockReset();
});

describe.skip('TrialGate', () => {  // TrialGate is disabled — re-enable when approval flow is turned back on
  it('business on trial sees countdown banner AND the page', () => {
    mockSupplier = { id: 1, approvalStatus: 'trial', trialStartedAt: new Date().toISOString() };
    renderAt('/dashboard');
    expect(screen.getByText('GATED-CONTENT')).toBeInTheDocument();
    expect(screen.getByText(/Free trial/)).toBeInTheDocument();
  });

  it('business with expired trial is locked out with Request Approval', () => {
    mockSupplier = {
      id: 1, approvalStatus: 'trial',
      trialStartedAt: new Date(Date.now() - TRIAL_DURATION_MS - 1000).toISOString(),
    };
    renderAt('/dashboard');
    expect(screen.queryByText('GATED-CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText('Your free trial has ended')).toBeInTheDocument();
    expect(screen.getByText('Request Approval')).toBeInTheDocument();
  });

  it('Request Approval calls the API then refreshes the account', async () => {
    mockSupplier = {
      id: 42, approvalStatus: 'trial',
      trialStartedAt: new Date(Date.now() - TRIAL_DURATION_MS - 1000).toISOString(),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ approvalStatus: 'pending' }), { status: 200 }),
    );
    renderAt('/pos');
    await act(async () => { screen.getByText('Request Approval').click(); });

    expect(fetchSpy).toHaveBeenCalledWith('/api/suppliers/42/request-approval', { method: 'POST' });
    expect(mockRefresh).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('pending business sees the awaiting-review screen', () => {
    mockSupplier = { id: 1, approvalStatus: 'pending' };
    renderAt('/inventory');
    expect(screen.getByText('Approval requested')).toBeInTheDocument();
    expect(screen.queryByText('GATED-CONTENT')).not.toBeInTheDocument();
  });

  it('approved business passes straight through, no banner', () => {
    mockSupplier = { id: 1, approvalStatus: 'approved' };
    renderAt('/dashboard');
    expect(screen.getByText('GATED-CONTENT')).toBeInTheDocument();
    expect(screen.queryByText(/Free trial/)).not.toBeInTheDocument();
  });

  it('pre-migration account (no status) is never gated', () => {
    mockSupplier = { id: 1 };
    renderAt('/dashboard');
    expect(screen.getByText('GATED-CONTENT')).toBeInTheDocument();
  });

  it('expired business can still use SHOPPING pages', () => {
    mockSupplier = {
      id: 1, approvalStatus: 'trial',
      trialStartedAt: new Date(Date.now() - TRIAL_DURATION_MS - 1000).toISOString(),
    };
    renderAt('/');
    expect(screen.getByText('GATED-CONTENT')).toBeInTheDocument();
  });

  it('supplier is gated on /profile (their management hub)', () => {
    mockAccountType = 'supplier';
    mockSupplier = {
      id: 1, approvalStatus: 'trial',
      trialStartedAt: new Date(Date.now() - TRIAL_DURATION_MS - 1000).toISOString(),
    };
    renderAt('/profile');
    expect(screen.queryByText('GATED-CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText('Your free trial has ended')).toBeInTheDocument();
  });

  it('customers are never gated', () => {
    mockAccountType = 'user';
    mockSupplier = null;
    renderAt('/profile');
    expect(screen.getByText('GATED-CONTENT')).toBeInTheDocument();
  });
});
