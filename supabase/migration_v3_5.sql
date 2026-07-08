-- Migration v3.5 — Web Push subscriptions
-- Run this in your Supabase project SQL editor (knnrmdkzoicjuuaaownb).
--
-- One row per browser that granted notification permission. A user can have
-- several (phone + laptop). The endpoint is the unique identity of a browser
-- subscription; dead endpoints (404/410 on send) are pruned automatically by
-- lib/pushNotify.ts.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL      PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);
