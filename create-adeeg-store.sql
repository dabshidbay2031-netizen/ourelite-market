-- ============================================================================
--  Adeeg Market — one business that owns the imported catalog
--  Run this in the Supabase SQL editor BEFORE importing adeeg-catalog-import.csv
--  (products.supplier_id = 9001 references this row).
-- ============================================================================

INSERT INTO suppliers (
  id, name, location, icon, description, bio,
  categories, contact_numbers,
  min_order, delivery_days, discount,
  slug, verified, badge,
  account_type, approval_status, hide_stock
) VALUES (
  9001,
  'Adeeg Market',
  'Mogadishu, Somalia',
  '🛒',
  'Adeeg Market is a full-range supermarket — groceries, household, beauty, baby care, electronics and more, delivered across Mogadishu.',
  'Your everyday supermarket in Mogadishu. Fresh food, home essentials, and thousands of products under one roof.',
  ARRAY['food','home','cosmetics','health','electronics','clothes','medicine'],
  ARRAY[]::TEXT[],
  0,
  '1-3',
  0,
  'adeeg-market',
  true,
  'Verified',
  'business',
  'approved',
  false
)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  location    = EXCLUDED.location,
  icon        = EXCLUDED.icon,
  description = EXCLUDED.description,
  bio         = EXCLUDED.bio,
  categories  = EXCLUDED.categories,
  slug        = EXCLUDED.slug,
  verified    = EXCLUDED.verified,
  updated_at  = NOW();

-- Sanity check
SELECT id, name, slug, account_type, approval_status FROM suppliers WHERE id = 9001;
