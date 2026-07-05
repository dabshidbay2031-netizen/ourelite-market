// Seeds demo activity for a field agent so the commission/lead-gen panel shows
// real numbers: ~60 registered products (→ Silver tier) + several existing
// businesses stocking them (→ stores reached / adoption bonus).
// Run: node scripts/seed-agent-demo.mjs
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

const AGENT_ID = 11; // Field Agent Mo (mogatest.agent@gmail.com)

async function nextId(table) {
  const { data } = await sb.from(table).select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  return ((data?.id ?? 0)) + 1;
}

const CATS = ['electronics', 'fashion', 'home', 'health', 'food', 'sports'];
const ADJ  = ['Premium', 'Classic', 'Pro', 'Eco', 'Smart', 'Deluxe', 'Compact', 'Urban', 'Prime', 'Ultra'];
const NOUN = {
  electronics: ['Earbuds', 'Charger', 'Power Bank', 'LED Lamp', 'USB Hub', 'Speaker'],
  fashion:     ['T-Shirt', 'Cap', 'Sneakers', 'Backpack', 'Sunglasses', 'Belt'],
  home:        ['Mug Set', 'Cushion', 'Wall Clock', 'Storage Box', 'Lamp', 'Vase'],
  health:      ['Vitamin C', 'Hand Cream', 'Face Wash', 'Lip Balm', 'Bandages', 'Shampoo'],
  food:        ['Honey Jar', 'Coffee Pack', 'Olive Oil', 'Tea Box', 'Granola', 'Spice Mix'],
  sports:      ['Yoga Mat', 'Water Bottle', 'Resistance Band', 'Jump Rope', 'Dumbbell', 'Gym Towel'],
};

async function main() {
  // Clean any prior demo run for this agent (idempotent)
  const { data: existing } = await sb.from('products').select('id').eq('supplier_id', AGENT_ID);
  const existingIds = (existing ?? []).map(r => r.id);
  if (existingIds.length) {
    await sb.from('business_products').delete().in('product_id', existingIds);
    await sb.from('order_items').delete().in('product_id', existingIds);
    await sb.from('products').delete().eq('supplier_id', AGENT_ID);
    console.log(`Cleared ${existingIds.length} prior demo products.`);
  }

  let pid = await nextId('products');
  const COUNT = 60;
  const rows = [];
  for (let i = 0; i < COUNT; i++) {
    const cat   = CATS[i % CATS.length];
    const nouns = NOUN[cat];
    const name  = `${ADJ[i % ADJ.length]} ${nouns[i % nouns.length]} ${Math.floor(i / nouns.length) + 1}`;
    const price = Math.round((5 + Math.random() * 95) * 100) / 100;
    rows.push({
      id: pid++,
      name,
      price,
      original_price: Math.round(price * 1.2 * 100) / 100,
      cost: Math.round(price * 0.6 * 100) / 100,
      category: cat,
      stock: Math.floor(Math.random() * 80),
      sku: `AG-${AGENT_ID}-${String(i + 1).padStart(3, '0')}`,
      supplier_id: AGENT_ID,
      sold: Math.random() < 0.5 ? Math.floor(Math.random() * 40) : 0,
      description: `${name} — registered by field agent.`,
    });
  }
  // Insert (drop cost if the column isn't migrated yet)
  let ins = await sb.from('products').insert(rows).select('id');
  if (ins.error && /cost/.test(ins.error.message)) {
    ins = await sb.from('products').insert(rows.map(({ cost, ...r }) => r)).select('id');
  }
  if (ins.error) { console.error('product insert failed:', ins.error.message); process.exit(1); }
  const productIds = ins.data.map(r => r.id);
  console.log(`Registered ${productIds.length} products for agent ${AGENT_ID}.`);

  // Pick a few real businesses to stock the agent's products
  const { data: bizes } = await sb
    .from('suppliers').select('id, name').eq('account_type', 'business').limit(5);
  if (!bizes?.length) { console.log('No businesses found to claim products.'); return; }

  let bpId = await nextId('business_products');
  let claims = 0;
  for (const biz of bizes) {
    // each store stocks a random 8–15 of the agent's products
    const n = 8 + Math.floor(Math.random() * 8);
    const picks = [...productIds].sort(() => Math.random() - 0.5).slice(0, n);
    const bpRows = picks.map((productId, k) => ({
      id: bpId++,
      supplier_id: biz.id,
      product_id: productId,
      custom_price: Math.round((10 + Math.random() * 120) * 100) / 100,
      stock_qty: Math.floor(Math.random() * 50),
      moq: 1,
      is_active: true,
    }));
    const { error } = await sb.from('business_products').insert(bpRows);
    if (error) { console.log(`  ${biz.name}: claim failed — ${error.message}`); }
    else { claims += bpRows.length; console.log(`  ${biz.name} now stocks ${bpRows.length} of the agent's products.`); }
  }
  console.log(`\nDone. ${productIds.length} registered, ${bizes.length} stores reached, ${claims} claim links.`);
}

main().catch(e => { console.error(e); process.exit(1); });
