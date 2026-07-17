-- ============================================================
-- migration_customer_gender.sql
-- Adds an optional gender field to the per-store customer book.
-- Idempotent. Values: 'male' | 'female' | '' (unspecified).
-- The API degrades gracefully until this runs (gender is dropped on write),
-- so applying it is safe at any time.
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT ''
  CHECK (gender IN ('', 'male', 'female'));
