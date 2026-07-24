-- ═══════════════════════════════════════════════════════════════════════════
-- migration_v4_1.sql — Wallet reset to zero + payout REQUEST/APPROVAL flow
--
-- 1. Wallet epoch: every store's wallet starts counting from the moment this
--    migration runs, so historical/seeded orders no longer inflate the balance
--    (that is where the phantom $43,235.12 opening balance came from). Only
--    payments taken from now on are withdrawable.
--
-- 2. Payouts become REQUESTS. A shop asks for a payout; it sits `pending` and
--    the amount is reserved against the balance. An admin then approves (→
--    `approved`, money sent) or rejects (→ `rejected`, amount released) with a
--    note the shop can read.
--
-- Run this in the Supabase SQL editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Wallet epoch ────────────────────────────────────────────────────────
-- Payments BEFORE this timestamp are ignored by the wallet. Existing stores get
-- "now", so everyone starts at $0.00; stores created later default to their own
-- creation moment via the API.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS wallet_started_at TIMESTAMPTZ;
UPDATE suppliers SET wallet_started_at = NOW() WHERE wallet_started_at IS NULL;

-- ── 2. Payout request/approval columns ─────────────────────────────────────
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS status       TEXT        NOT NULL DEFAULT 'approved';
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS note         TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS decided_at   TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS decided_by   TEXT;

-- Rows that existed before this migration were instant self-payouts: they were
-- already paid, so they stay 'approved'.
UPDATE payouts SET requested_at = created_at WHERE requested_at IS NULL;
UPDATE payouts SET decided_at   = created_at WHERE decided_at IS NULL AND status = 'approved';

ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD  CONSTRAINT payouts_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS payouts_status_idx ON payouts(status);

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT status, COUNT(*), SUM(amount) FROM payouts GROUP BY status;
-- SELECT id, name, wallet_started_at FROM suppliers ORDER BY id LIMIT 10;
