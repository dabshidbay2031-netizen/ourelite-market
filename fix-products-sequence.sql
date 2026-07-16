-- ============================================================================
--  Fix: "duplicate key value violates unique constraint products_pkey"
--       Key (id)=(71) already exists
--
--  Cause: products were seeded with explicit ids, so the SERIAL id sequence
--  lagged behind MAX(id). New INSERTs (like the catalog CSV import, which has
--  no id column) draw a stale id and collide with an existing row.
--
--  Fix: resync the sequence to one past the current maximum. Non-destructive —
--  it only advances a counter, never touches row data.
--
--  Run this in the Supabase SQL editor, then re-import adeeg-catalog-import.csv.
-- ============================================================================

-- Before: see the mismatch
SELECT
  (SELECT MAX(id) FROM products)                             AS max_row_id,
  (SELECT last_value FROM products_id_seq)                   AS sequence_at;

-- The fix
SELECT setval(
  pg_get_serial_sequence('products', 'id'),
  COALESCE((SELECT MAX(id) FROM products), 1)
);

-- After: sequence_at should now equal max_row_id; the next insert gets max+1
SELECT
  (SELECT MAX(id) FROM products)           AS max_row_id,
  (SELECT last_value FROM products_id_seq) AS sequence_at;

-- NOTE: do NOT run the equivalent setval for `suppliers`. The Adeeg store is
-- inserted with the explicit reserved id 9001, and resyncing that sequence
-- would push every future store id to 9002+.
