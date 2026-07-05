-- Run in Supabase SQL editor after restoring the project.
-- Safe to re-run (all statements are idempotent).

CREATE TABLE IF NOT EXISTS cashiers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   text NOT NULL,          -- Firebase UID of the business owner
  name          text NOT NULL,
  phone         text NOT NULL,
  password_hash text NOT NULL,
  privileges    text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Phone must be unique within a business
CREATE UNIQUE INDEX IF NOT EXISTS cashiers_business_phone_idx ON cashiers (business_id, phone);
CREATE INDEX IF NOT EXISTS cashiers_business_id_idx ON cashiers (business_id);
