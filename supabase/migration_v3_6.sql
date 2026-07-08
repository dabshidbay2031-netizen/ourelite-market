-- Migration v3.6 — Online-only stores
-- Run this in your Supabase project SQL editor (knnrmdkzoicjuuaaownb).
--
-- A store can now declare itself ONLINE-ONLY: it has no physical shopfront, so
-- the app hides its map/pickup option and labels it "🌐 Online store" instead
-- of a district. Physical stores are unaffected (default false).

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS online_only BOOLEAN NOT NULL DEFAULT false;

-- Online-only stores have no shopfront to pick up from, so a stray GPS pin
-- would be misleading. Not enforced as a constraint (a store may toggle back),
-- but new online-only stores start with no coordinates.
COMMENT ON COLUMN suppliers.online_only IS
  'true = internet-only store (no physical location; no pickup, no map)';
