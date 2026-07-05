-- Online-payment wallet + payouts (business dashboard "Online Payments" section).
-- Run once in the Supabase SQL editor on an existing database.
-- (schema_v3.sql already contains these for a fresh install.)

-- 1. The store's saved payout phone number — a payout always goes here.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payout_number TEXT;

-- 2. Payout ledger. Balance = online-payment total − SUM(payouts.amount).
CREATE TABLE IF NOT EXISTS payouts (
  id           SERIAL        PRIMARY KEY,
  supplier_id  INTEGER       NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  amount       DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  phone        TEXT          NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payouts_supplier_idx ON payouts(supplier_id);

-- RLS (reads open like the rest of the app; writes go through the service-role API)
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payouts_read" ON payouts;
CREATE POLICY "payouts_read" ON payouts FOR SELECT USING (true);
