/**
 * Free-trial + approval lifecycle for business and supplier accounts.
 *
 * Lifecycle: trial → (expires) → request approval → pending → approved.
 *
 * ──────────────────────────────────────────────────────────────────
 *  TRIAL LENGTH — the only line to change:
 *
 *    sample (now):  5 minutes
 *    production:    7 days  →  7 * 24 * 60 * 60 * 1000
 * ──────────────────────────────────────────────────────────────────
 */
export const TRIAL_DURATION_MS = 5 * 60 * 1000;

export type ApprovalStatus = 'trial' | 'pending' | 'approved' | 'rejected';

export type TrialPhase =
  | 'approved'   // full access, forever
  | 'trial'      // inside the free trial window
  | 'expired'    // trial over, approval not yet requested
  | 'pending'    // approval requested, awaiting admin review
  | 'rejected';  // admin rejected the request

export interface TrialState {
  phase:  TrialPhase;
  /** ms remaining in the trial (0 unless phase === 'trial') */
  msLeft: number;
}

interface TrialFields {
  approvalStatus?: ApprovalStatus | null;
  trialStartedAt?: string | null;
}

/**
 * `now` is injectable for tests. Accounts created before the migration
 * (no approval_status column) count as approved — the feature switches
 * on per-account once the DB has the columns.
 */
export function getTrialState(s: TrialFields | null | undefined, now: number = Date.now()): TrialState {
  const status = s?.approvalStatus ?? 'approved';

  if (status === 'approved') return { phase: 'approved', msLeft: 0 };
  if (status === 'pending')  return { phase: 'pending',  msLeft: 0 };
  if (status === 'rejected') return { phase: 'rejected', msLeft: 0 };

  // status === 'trial'
  const started = s?.trialStartedAt ? Date.parse(s.trialStartedAt) : now;
  const msLeft  = started + TRIAL_DURATION_MS - now;
  return msLeft > 0 ? { phase: 'trial', msLeft } : { phase: 'expired', msLeft: 0 };
}

/** "4:32" for minutes-scale trials, "6d 23h" for day-scale ones. */
export function formatTimeLeft(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  if (days >= 1) {
    const hours = Math.floor((totalSec % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
  const hours = Math.floor(totalSec / 3600);
  if (hours >= 1) {
    const min = Math.floor((totalSec % 3600) / 60);
    return `${hours}h ${min}m`;
  }
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
