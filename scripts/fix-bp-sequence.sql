-- Permanent fix for: claiming a product fails with
--   duplicate key value violates unique constraint "business_products_pkey"
--
-- Cause: rows were seeded with explicit ids, so the SERIAL id sequence lagged
-- behind MAX(id) and new INSERTs reused an existing id. Resync the sequence to
-- one past the current maximum. Safe and non-destructive — it only advances the
-- counter, it never touches row data.
--
-- Run once in the Supabase SQL editor. The API also self-heals per-claim, but
-- this restores the fast path.
SELECT setval(
  pg_get_serial_sequence('business_products', 'id'),
  COALESCE((SELECT MAX(id) FROM business_products), 1)
);

-- Same class of bug can hit any table seeded with explicit ids; apply as needed:
-- SELECT setval(pg_get_serial_sequence('products',  'id'), COALESCE((SELECT MAX(id) FROM products),  1));
-- SELECT setval(pg_get_serial_sequence('suppliers', 'id'), COALESCE((SELECT MAX(id) FROM suppliers), 1));
