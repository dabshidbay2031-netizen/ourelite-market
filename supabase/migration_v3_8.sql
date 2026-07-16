-- ============================================================================
--  migration_v3_8.sql — claimed products become fully editable per store
--
--  Until now a claim could only override price / stock / moq / is_active;
--  name, photos and every other detail came from the shared catalog row, so a
--  store could not put its own photo on a product it sells.
--
--  Each column below is an OVERRIDE: NULL means "inherit from the catalog row"
--  (products.*). That keeps ONE product identity per item, which is what makes
--  reviews shared across every store selling it (reviews.product_id) — exactly
--  the intended behaviour: everything else is per-store, reviews are common.
--
--  Safe to re-run: every ADD is IF NOT EXISTS. Existing claims are untouched
--  and keep inheriting (all overrides start NULL).
-- ============================================================================

ALTER TABLE business_products ADD COLUMN IF NOT EXISTS name           TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS image_url      TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS image_urls     TEXT[];
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS brand          TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS category       TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS sub_category   TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS tags           TEXT[];
-- The store's own inventory code for the item.
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS sku            TEXT;
-- Strike-through / "was" price and the store's own cost basis, per store.
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS cost           DECIMAL(10,2);
-- Set once a store edits anything, so reads can skip the merge on untouched rows.
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS customized_at  TIMESTAMPTZ;

-- NOTE: `barcode` is deliberately NOT overridable. It identifies the physical
-- product for scanning, so it stays shared with the catalog row — as do reviews.

-- Explore lists every store's version as its own card, so listings are read by
-- store and by product.
CREATE INDEX IF NOT EXISTS business_products_active_idx
  ON business_products (is_active, supplier_id);

-- Confirm
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'business_products'
ORDER BY ordinal_position;
