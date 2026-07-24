-- ═══════════════════════════════════════════════════════════════════════════
-- migration_v4_0.sql — Claimed products become REAL owned copies
--
-- Before: a business "claimed" a wholesaler's product via a business_products
--         row. The catalog row still belonged to the wholesaler, so opening the
--         product showed the ORIGINAL owner as the seller.
-- After:  claiming INSERTs a new products row owned by the claiming store, with
--         its own id, price, stock and photos. products.copied_from_product_id
--         records where it came from.
--
-- This script (1) adds the marker column and (2) converts every existing active
-- claim into a real owned product row, carrying over the store's own overrides.
-- Safe to re-run: already-converted claims are skipped.
--
-- Run this in the Supabase SQL editor. It is wrapped in a transaction, so it
-- either fully applies or fully rolls back.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Marker column: which catalog row this listing was copied from ────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS copied_from_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_copied_from ON products(copied_from_product_id);

-- One store may hold only ONE copy of a given source product.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_one_copy_per_store
  ON products(supplier_id, copied_from_product_id)
  WHERE copied_from_product_id IS NOT NULL;

-- The per-store override columns (migration_v3_8) are read below. Ensure they
-- exist so this script also works on a DB that never ran v3_8.
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS name           TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS image_url      TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS image_urls     TEXT[];
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS brand          TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS category       TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS sub_category   TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS tags           TEXT[];
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS sku            TEXT;
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS cost           DECIMAL(10,2);

-- ── 2. Convert every active claim into a real owned product row ─────────────
-- A claim's own values win; anything the store never customised is inherited
-- from the source catalog row. Ratings/reviews/sales start clean, because this
-- is a brand-new listing belonging to a different shop.
--
-- Ids are assigned explicitly (MAX(id) + row number) because this database's
-- SERIAL sequence is known to lag behind max(id) — see scripts/fix-bp-sequence.sql.
INSERT INTO products (
  id, name, price, original_price, cost, category, sub_category, icon, stock, sku,
  supplier_id, rating, reviews, sold, description, barcode, tags, brand,
  image_url, image_urls, price_tiers, is_b2b, moq, tax_mode, copied_from_product_id
)
SELECT
  (SELECT COALESCE(MAX(id), 0) FROM products) + ROW_NUMBER() OVER (ORDER BY bp.id),
  COALESCE(bp.name,           p.name),
  bp.custom_price,                                   -- the store's own price
  COALESCE(bp.original_price, p.original_price),
  COALESCE(bp.cost,           p.cost),
  COALESCE(bp.category,       p.category),
  COALESCE(bp.sub_category,   p.sub_category),
  p.icon,
  bp.stock_qty,                                      -- the store's own stock
  COALESCE(bp.sku,            p.sku),
  bp.supplier_id,                                    -- ← the claiming store OWNS it
  0, 0, 0,                                           -- fresh listing: no rating/reviews/sales
  COALESCE(bp.description,    p.description),
  p.barcode,                                         -- identifies the product itself
  COALESCE(bp.tags,           p.tags),
  COALESCE(bp.brand,          p.brand),
  COALESCE(bp.image_url,      p.image_url),
  COALESCE(bp.image_urls,     p.image_urls),
  p.price_tiers,
  p.is_b2b,
  bp.moq,
  p.tax_mode,
  bp.product_id                                      -- provenance
FROM business_products bp
JOIN products p ON p.id = bp.product_id
WHERE bp.is_active
  -- never convert the same claim twice
  AND NOT EXISTS (
    SELECT 1 FROM products c
     WHERE c.supplier_id            = bp.supplier_id
       AND c.copied_from_product_id = bp.product_id
  )
  -- a store that already owns the catalog row outright needs no copy
  AND p.supplier_id IS DISTINCT FROM bp.supplier_id;

-- Keep the SERIAL sequence ahead of the explicit ids inserted above.
SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products));

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS copies FROM products WHERE copied_from_product_id IS NOT NULL;
-- SELECT s.name AS store, COUNT(*) AS copied
--   FROM products p JOIN suppliers s ON s.id = p.supplier_id
--  WHERE p.copied_from_product_id IS NOT NULL GROUP BY s.name ORDER BY copied DESC;
