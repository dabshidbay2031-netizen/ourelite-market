-- Run this in Supabase SQL editor after restoring the project.
-- Safe to re-run (all statements are idempotent).

-- 1. POS sessions table
CREATE TABLE IF NOT EXISTS pos_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by       text NOT NULL,
  cashier_name    text NOT NULL DEFAULT '',
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  opening_float   numeric(12,2) NOT NULL DEFAULT 0,
  closing_counted numeric(12,2),
  expected_cash   numeric(12,2),
  discrepancy     numeric(12,2),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes           text
);

-- 2. Add session + cashier columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS session_id    uuid REFERENCES pos_sessions(id),
  ADD COLUMN IF NOT EXISTS cashier_name  text;

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS pos_sessions_status_idx ON pos_sessions (status, opened_at DESC);
CREATE INDEX IF NOT EXISTS orders_session_id_idx   ON orders (session_id);
