-- ════════════════════════════════════════════════════════════════
-- Migration v3.7 — order/review attribution + customer invoicing
--
-- Run this in the Supabase SQL editor (safe to re-run; everything is
-- IF NOT EXISTS). Enables:
--   1. orders.supplier_id    — which STORE sold the order. Fixes the
--      dashboard counting other stores' sales of the same claimed
--      product (orders used to be matched by product id only).
--   2. reviews.supplier_id   — which STORE a review credits. Product
--      reviews now roll up into that store's suppliers.rating/reviews.
--   3. customers.supplier_id — customers belong to ONE business, not
--      every business on the platform.
--   4. invoices + invoice_payments — credit-customer ledger: invoice a
--      customer (pay-later), record partial payments (amount, method,
--      date), track the outstanding balance per customer.
-- ════════════════════════════════════════════════════════════════

-- 1. Order → selling store attribution
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id);

-- 2. Review → store attribution
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_reviews_supplier ON reviews(supplier_id);

-- 3. Customers are per-business
ALTER TABLE customers ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_customers_supplier ON customers(supplier_id);

-- 4. Credit invoices (receivables ledger)
CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,                       -- INV-<ts>-<rand>
  supplier_id   INTEGER NOT NULL,
  customer_id   TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{id,name,price,qty}] price snapshot
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'unpaid',         -- unpaid | partial | paid
  notes         TEXT,
  order_id      TEXT,                                   -- linked order (stock/sales), optional
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id         BIGSERIAL PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount     NUMERIC(12,2) NOT NULL,
  method     TEXT NOT NULL DEFAULT 'cash',              -- cash | waafi | card | sifalo
  note       TEXT,
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invpay_invoice ON invoice_payments(invoice_id);
