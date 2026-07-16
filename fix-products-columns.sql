-- ============================================================================
--  Bring the live `products` table up to schema_v3 before importing the catalog.
--  Safe to run repeatedly — every ADD is "IF NOT EXISTS", so existing columns
--  are left untouched. Run this in the Supabase SQL editor, then re-import
--  adeeg-catalog-import.csv.
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost           DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS icon           TEXT          NOT NULL DEFAULT '📦';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku            TEXT          NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS description    TEXT          NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags           TEXT[]        DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand          TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url      TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls     TEXT[]        DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tiers    JSONB         DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_b2b         BOOLEAN       NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS moq            INTEGER       NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_mode       TEXT          NOT NULL DEFAULT 'none';

-- Confirm what the table now has:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'products'
ORDER BY ordinal_position;
