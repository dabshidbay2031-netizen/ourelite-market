-- Migration v3.4 — Site settings (admin-editable storefront config)
-- Run this in your Supabase project SQL editor (knnrmdkzoicjuuaaownb).
--
-- A tiny key/value store for global, admin-controlled storefront settings.
-- The first user of this table is the Explore "Hot Deals" hero banner, whose
-- image + copy an admin can now change from the Admin → Storefront tab without
-- a code deploy. Values are JSONB so a single row can hold a whole config blob.

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Seed the hero banner row with the values that were previously hard-coded in
-- ExploreView, so the storefront looks identical until an admin edits it.
INSERT INTO site_settings (key, value)
VALUES (
  'hero_banner',
  '{
     "enabled":  true,
     "imageUrl": "",
     "tag":      "🔥 Hot Deals",
     "title":    "Up to 30% Off This Week",
     "subtitle": "Limited time offers on top products",
     "ctaLabel": "Shop Now"
   }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
