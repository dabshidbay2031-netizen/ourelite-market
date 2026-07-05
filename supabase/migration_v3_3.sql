-- Migration v3.3 — Product cost (for profit on the business dashboard)
-- Run this in your Supabase project SQL editor (knnrmdkzoicjuuaaownb).

-- What the OWNING supplier paid to acquire/produce a catalog item. For a
-- retail business that claims a wholesaler's product (business_products),
-- this column is irrelevant to them — their cost is the wholesaler's
-- products.price, used directly in the profit calc. This column only
-- matters for products a store owns/creates directly via Inventory.
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (cost >= 0);
