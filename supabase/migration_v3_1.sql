-- ================================================================
-- Mogarenta migration v3.1
-- Run this in your Supabase project SQL editor (knnrmdkzoicjuuaaownb)
-- ================================================================

-- 1. Remove icon column from products (photos only now)
ALTER TABLE products DROP COLUMN IF EXISTS icon;

-- 2. Rebuild addresses table as GPS coordinates
--    Old columns removed; new lat/lng + label + notes added.
ALTER TABLE addresses DROP COLUMN IF EXISTS full_name;
ALTER TABLE addresses DROP COLUMN IF EXISTS street;
ALTER TABLE addresses DROP COLUMN IF EXISTS city;
ALTER TABLE addresses DROP COLUMN IF EXISTS country;
ALTER TABLE addresses DROP COLUMN IF EXISTS phone;
ALTER TABLE addresses DROP COLUMN IF EXISTS is_default;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS notes     TEXT NOT NULL DEFAULT '';

-- 3. Add profile photo URL and bio to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio        TEXT NOT NULL DEFAULT '';

-- 4. Allow the new Field Agent role in suppliers.account_type
--    The original CHECK only permitted ('business','supplier'); agents are
--    stored in the suppliers table with account_type = 'agent'.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_account_type_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_account_type_check
  CHECK (account_type IN ('business','supplier','agent'));

-- 5. Add VAT/tax mode to products
--    none     = no tax applies
--    included = price already contains 5% VAT
--    excluded = 5% VAT is added on top at checkout
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_mode TEXT NOT NULL DEFAULT 'none'
  CHECK (tax_mode IN ('none','included','excluded'));

-- 6. Add store GPS coordinates to suppliers
--    Used to render a map + driving route on the store profile page.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 7. Add storefront slug to suppliers (custom #/:slug shop URL)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_slug_key ON suppliers (slug) WHERE slug IS NOT NULL;
