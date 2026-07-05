-- Migration v3.2 — Field Agent role
-- Agents are stored in the suppliers table with account_type = 'agent'.
-- No schema change is required; this migration is informational.
-- Run this in your Supabase SQL editor to confirm the current state.

-- Verify that existing suppliers can accept 'agent' as account_type:
-- (The column is TEXT with no CHECK constraint, so this is already valid.)
-- SELECT id, name, account_type, auth_user_id FROM suppliers WHERE account_type = 'agent';

-- Optional: create an index for fast agent lookups (safe to run even if it already exists)
CREATE INDEX IF NOT EXISTS idx_suppliers_account_type ON suppliers(account_type);

-- Optional: create an index on products.supplier_id for fast registry queries
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
