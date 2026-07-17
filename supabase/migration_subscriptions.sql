-- ============================================================
-- migration_subscriptions.sql — seller subscription billing
--
-- Adds the paid-access model for business & supplier accounts:
--   • $14.99 / month  business
--   • $24.99 / month  supplier
--   • 7-day money-back guarantee (full self-service refund inside the window)
--
-- Idempotent: safe to run more than once.
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS subscription_paid_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_plan        TEXT,
  ADD COLUMN IF NOT EXISTS subscription_amount      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS subscription_sid         TEXT;

-- Grandfather EXISTING seller accounts. Stores that joined before billing
-- existed must not be locked out by the new paywall, so they count as paid
-- long ago (created_at is well past the 7-day window → active, non-refundable).
-- New sign-ups keep NULL subscription_paid_at → locked until they pay.
UPDATE suppliers
   SET subscription_paid_at = COALESCE(subscription_paid_at, created_at),
       subscription_plan    = COALESCE(subscription_plan, account_type),
       subscription_amount  = COALESCE(
         subscription_amount,
         CASE account_type WHEN 'supplier' THEN 24.99
                           WHEN 'business' THEN 14.99
                           ELSE NULL END)
 WHERE account_type IN ('business', 'supplier');

-- Audit ledger: one row per payment / refund (receipts + reconciliation).
CREATE TABLE IF NOT EXISTS subscription_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id  BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  kind         TEXT   NOT NULL CHECK (kind IN ('payment', 'refund')),
  amount       NUMERIC(10,2) NOT NULL,
  plan         TEXT,
  method       TEXT,        -- sifalo gateway (waafi / edahab / pbwallet) or 'admin'
  sid          TEXT,        -- Sifalo transaction id (or MOCK-… in mock mode)
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_events_supplier_idx
  ON subscription_events(supplier_id);
