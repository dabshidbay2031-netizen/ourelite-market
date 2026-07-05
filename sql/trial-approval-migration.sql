-- Trial + approval columns for business/supplier accounts.
-- Run this in the Supabase SQL editor once the project is restored.
--
-- Existing accounts get a FRESH trial starting at migration time
-- (approval_status defaults to 'trial'), so nobody is locked out
-- retroactively. Approve any account immediately with:
--   UPDATE suppliers SET approval_status = 'approved' WHERE id = <id>;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS approval_status        text        NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_started_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approval_requested_at  timestamptz;

-- Guard the status values
ALTER TABLE suppliers
  DROP CONSTRAINT IF EXISTS suppliers_approval_status_check;
ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_approval_status_check
  CHECK (approval_status IN ('trial', 'pending', 'approved', 'rejected'));

-- Optional: pre-approve all accounts that existed before this feature
-- (uncomment if you don't want existing users to go through a trial)
-- UPDATE suppliers SET approval_status = 'approved';
