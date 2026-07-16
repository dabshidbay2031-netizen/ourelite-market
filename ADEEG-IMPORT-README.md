# Adeeg Market catalog import

Two files, imported in this **exact order** (products reference the store):

| Step | File | How |
|---|---|---|
| 1 | `create-adeeg-store.sql` | Supabase → **SQL Editor** → paste → **Run**. Creates the "Adeeg Market" business as `supplier_id = 9001`. |
| 2 | `adeeg-catalog-import.csv` | Supabase → **Table Editor** → `products` table → **Insert → Import data from CSV** → upload. |

## What's in the CSV

- **3,689 products** (from 3,776 rows; 87 exact-duplicate titles removed), all owned by **one business** (`supplier_id = 9001`).
- Columns match the `products` table exactly:
  `name, price, original_price, cost, category, sub_category, icon, stock, sku,
  supplier_id, description, tags, brand, image_url, image_urls, is_b2b, moq, tax_mode`
- `id` is omitted so Postgres auto-assigns it.

## Mapping decisions

- **Categories** — classified across your 13-category taxonomy by keywords on title + product type + tags:
  food 1208 · cosmetics 909 · home 507 · clothes 335 · other 240 · electronics 186 · medicine 185 · health 119.
- **Prices** — kept in USD. `Compare At Price` → `original_price` only when it is higher than the price (otherwise `0.00`).
- **Stock** — `Available = true` → **100**; `Available = false` (390 items) → **0**.
- **Brand** — from Vendor, but generic "Adeeg.com" vendors are left blank.
- **Images** — `image_url` = primary; `image_urls` = all images (Postgres array literal).
- **Tags** — semicolon list → Postgres array, de-duplicated, capped at 15.
- `cost = 0`, `is_b2b = false`, `moq = 1`, `tax_mode = none` (adjust later as needed).

## Notes / things you may want to tweak

- **`supplier_id = 9001`** is a reserved high id chosen to avoid colliding with your existing stores. If 9001 is already taken, change it in **both** files (the SQL `VALUES` and a find-replace in the CSV column) before importing.
- Images are **hot-linked from Shopify's CDN** (`cdn.shopify.com`). They'll display, but if you want to own them, re-host later (your `scripts/backfill-missing-images.mjs` is a starting point).
- Stock of 100 is a placeholder — set real quantities when you have them.
- Descriptions are simple; you can regenerate richer Somali ones later with the AI product-description writer.
