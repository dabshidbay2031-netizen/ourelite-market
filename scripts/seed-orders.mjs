/**
 * Seed demo order history for every claim-model business so their
 * /my-dashboard shows real revenue, trends, and recent orders.
 *
 * For each business (suppliers.account_type = 'business' that has claimed
 * products) this inserts ~10-18 orders spread over the last 6 months, each
 * containing 1-4 of that store's claimed products priced at its retail
 * custom_price. Idempotent: a business that already has seeded orders
 * (id prefix ORD-S<id>-) is skipped.
 *
 * Run:  node scripts/seed-orders.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const round2 = (n) => Math.round(n * 100) / 100;
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const NAMES = ['Amina Yusuf', 'Omar Farah', 'Khadija Ali', 'Hassan Warsame', 'Fatima Noor',
  'Ahmed Mohamed', 'Sahra Abdi', 'Yusuf Ibrahim', 'Mariam Hussein', 'Ali Jama',
  'Hodan Aden', 'Ibrahim Osman', 'Zahra Said', 'Mohamed Nur', 'Asha Diriye'];
// Weighted toward completed so revenue panels fill in.
const STATUSES = ['completed','completed','completed','completed','completed',
  'completed','processing','shipped','pending','cancelled'];

console.log('\n🧾  Seeding order history for claim-model businesses...\n');

// All businesses that have claimed products
const { data: businesses } = await sb
  .from('suppliers').select('id, name').eq('account_type', 'business').order('id');

let totalOrders = 0, seededBiz = 0, skipped = 0;

for (const biz of businesses ?? []) {
  // Claimed products (id + retail price) for this store
  const { data: claims } = await sb
    .from('business_products')
    .select('product_id, custom_price')
    .eq('supplier_id', biz.id);
  if (!claims || claims.length === 0) continue;

  // Skip if already seeded
  const { count: existing } = await sb
    .from('orders').select('id', { count: 'exact', head: true })
    .like('id', `ORD-S${biz.id}-%`);
  if ((existing ?? 0) > 0) { skipped++; continue; }

  const nOrders = rand(10, 18);
  const rows = [];
  for (let n = 0; n < nOrders; n++) {
    const lineCount = rand(1, 4);
    const items = [];
    let total = 0;
    const usedIdx = new Set();
    for (let l = 0; l < lineCount; l++) {
      let idx = rand(0, claims.length - 1);
      let guard = 0;
      while (usedIdx.has(idx) && guard++ < 6) idx = rand(0, claims.length - 1);
      usedIdx.add(idx);
      const c = claims[idx];
      const qty = rand(1, 5);
      items.push({ id: c.product_id, qty });
      total += Number(c.custom_price) * qty;
    }
    total = round2(total);

    // Spread created_at across the last ~180 days
    const daysAgo = rand(0, 179);
    const when = new Date();
    when.setDate(when.getDate() - daysAgo);
    when.setHours(rand(8, 20), rand(0, 59), 0, 0);

    rows.push({
      id: `ORD-S${biz.id}-${String(n + 1).padStart(3, '0')}`,
      customer_name:  pick(NAMES),
      customer_phone: `+25261${rand(1000000, 9999999)}`,
      user_id: null,
      items,
      subtotal: total,
      discount: 0,
      total,
      payment_method: pick(['cash', 'waafi', 'card']),
      status: pick(STATUSES),
      created_at: when.toISOString(),
    });
  }

  const { error } = await sb.from('orders').insert(rows);
  if (error) { console.log(`❌  ${biz.name}: ${error.message}`); continue; }
  totalOrders += rows.length;
  seededBiz++;
  console.log(`✅  ${biz.name.padEnd(34)} +${rows.length} orders`);
}

console.log(`\n🧾  Done — ${totalOrders} orders across ${seededBiz} businesses (${skipped} already had orders).\n`);
