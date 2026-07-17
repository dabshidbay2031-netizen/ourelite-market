/**
 * Backfill a PRICE snapshot onto existing order line items.
 *
 * The payout wallet used to value a store's online sales at the CURRENT price,
 * so a seller could raise their price and inflate their withdrawable balance
 * (see payouts/route.ts). New orders now snapshot the unit price at sale time;
 * this one-off backfill freezes existing orders too, closing the lever on
 * historical data.
 *
 *   • single-item orders → the TRUE historical unit price = subtotal / qty
 *   • multi-item orders  → the subtotal distributed across items weighted by
 *                          current catalog price, so the frozen unit prices
 *                          still sum back to the amount actually paid
 *                          (falls back to flat catalog price if unweightable)
 *
 * Idempotent: only touches items that don't already carry a `price`.
 *
 *   node scripts/backfill-order-item-prices.mjs          (dry run — reports only)
 *   node scripts/backfill-order-item-prices.mjs --apply  (writes the changes)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const ENVF = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
const env = {};
for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, S = env.SUPABASE_SERVICE_ROLE_KEY;
const svc = (p, o = {}) => fetch(U + '/rest/v1/' + p, {
  ...o, headers: { apikey: S, Authorization: 'Bearer ' + S, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers ?? {}) },
});

const round = n => Math.round(n * 100) / 100;

const orders = await svc('orders?select=id,items,subtotal&order=created_at.desc&limit=5000').then(r => r.json());
const products = await svc('products?select=id,price&limit=5000').then(r => r.json());
const catalogPrice = new Map(products.map(p => [p.id, Number(p.price) || 0]));

let scanned = 0, updated = 0, itemsFromSubtotal = 0, itemsFromCatalog = 0, skipped = 0;

for (const o of orders) {
  scanned++;
  const items = Array.isArray(o.items) ? o.items : [];
  if (items.length === 0) { skipped++; continue; }
  if (items.every(it => it.price != null)) { skipped++; continue; } // already snapshotted

  const subtotal = Number(o.subtotal) || 0;
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  // Weighted split of the true subtotal across items (by catalog price × qty).
  const weightSum = items.reduce((s, it) => s + (catalogPrice.get(it.id) ?? 0) * (Number(it.qty) || 0), 0);

  const priced = items.map(it => {
    if (it.price != null) return it;
    const qty = Number(it.qty) || 0;
    let price;
    if (items.length === 1 && totalQty > 0) {
      price = round(subtotal / totalQty);                       // exact historical unit price
      itemsFromSubtotal++;
    } else if (weightSum > 0 && subtotal > 0 && qty > 0) {
      const share = (catalogPrice.get(it.id) ?? 0) * qty / weightSum; // proportional to catalog value
      price = round(subtotal * share / qty);                     // frozen prices sum back to subtotal
      itemsFromSubtotal++;
    } else {
      price = catalogPrice.get(it.id) ?? 0;                      // unweightable → flat catalog price
      itemsFromCatalog++;
    }
    return { ...it, price };
  });

  if (APPLY) {
    const r = await svc(`orders?id=eq.${encodeURIComponent(o.id)}`, { method: 'PATCH', body: JSON.stringify({ items: priced }) });
    if (!r.ok) { console.log('  FAIL', o.id, r.status, (await r.text()).slice(0, 120)); continue; }
  }
  updated++;
}

console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'} — scanned ${scanned} orders`);
console.log(`  orders needing a snapshot: ${updated}`);
console.log(`  already-snapshotted / empty (skipped): ${skipped}`);
console.log(`  item prices from subtotal/qty (exact history): ${itemsFromSubtotal}`);
console.log(`  item prices from catalog (multi-item fallback): ${itemsFromCatalog}`);
if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
