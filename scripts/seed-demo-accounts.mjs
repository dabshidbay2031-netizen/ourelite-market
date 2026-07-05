// Creates 10 demo accounts (2 consumers, 3 businesses, 3 suppliers, 2 agents)
// and seeds products for every business/supplier.
// Run while dev server is on :3001:
//   node scripts/seed-demo-accounts.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const API = 'http://localhost:3000';
const PASSWORD = 'Demo1234!';

/* ── Account definitions ──────────────────────────────────────── */
const ACCOUNTS = [
  // Consumers
  { type: 'user',     email: 'demo.customer1@gmail.com', name: 'Amina Hassan',          avatar: '👩' },
  { type: 'user',     email: 'demo.customer2@gmail.com', name: 'Omar Farah',             avatar: '👨' },
  // Businesses
  { type: 'business', email: 'demo.freshmart@gmail.com', name: 'FreshMart Grocery',     avatar: '🛒' },
  { type: 'business', email: 'demo.techzone@gmail.com',  name: 'TechZone Electronics',  avatar: '📱' },
  { type: 'business', email: 'demo.homestyle@gmail.com', name: 'HomeStyle Decor',        avatar: '🏠' },
  // Suppliers
  { type: 'supplier', email: 'demo.harvest@gmail.com',   name: 'Golden Harvest Co.',    avatar: '🌾' },
  { type: 'supplier', email: 'demo.gadgetwh@gmail.com',  name: 'Gadget World Wholesale',avatar: '⚡' },
  { type: 'supplier', email: 'demo.fashionf@gmail.com',  name: 'Fashion Forward Ltd.',  avatar: '👗' },
  // Field Agents
  { type: 'agent',    email: 'demo.agent1@gmail.com',    name: 'Khalid Mohamed',        avatar: '🧑' },
  { type: 'agent',    email: 'demo.agent2@gmail.com',    name: 'Safia Warsame',         avatar: '👩' },
];

/* ── Products keyed by business/supplier email ─────────────────── */
const PRODUCTS = {
  'demo.freshmart@gmail.com': [
    { name: 'Organic Bananas (1kg)', price: 2.99, originalPrice: 3.99, category: 'food', stock: 500, description: 'Fresh organic bananas sourced daily. Rich in potassium and naturally sweet.', brand: 'FreshFarm', tags: ['fruit', 'organic', 'fresh'], imageUrls: ['https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600'], taxMode: 'none' },
    { name: 'Fresh Orange Juice 1L', price: 4.50, originalPrice: 5.50, category: 'food', stock: 200, description: 'Cold-pressed 100% natural orange juice, no added sugar.', brand: 'SunPress', tags: ['juice', 'orange', 'natural'], imageUrls: ['https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=600'], taxMode: 'excluded' },
    { name: 'Whole Grain Bread', price: 3.20, originalPrice: 3.80, category: 'food', stock: 150, description: 'Freshly baked whole grain loaf, high fibre, no preservatives.', brand: 'Baker\'s Best', tags: ['bread', 'wholegrain'], imageUrls: ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600'], taxMode: 'none' },
    { name: 'Greek Yogurt 500g', price: 5.99, originalPrice: 6.99, category: 'food', stock: 120, description: 'Creamy full-fat Greek yogurt, rich in protein and probiotics.', brand: 'Olympus', tags: ['dairy', 'yogurt', 'protein'], imageUrls: ['https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600'], taxMode: 'included' },
  ],
  'demo.techzone@gmail.com': [
    { name: 'Samsung Galaxy S24 Ultra', price: 1199, originalPrice: 1399, category: 'electronics', stock: 30, description: 'The ultimate Galaxy experience. 200MP camera, Snapdragon 8 Gen 3, built-in S Pen.', brand: 'Samsung', tags: ['phone', 'samsung', '5g', 'android'], imageUrls: ['https://images.unsplash.com/photo-1610945264803-c22b62d2a7b3?w=600'], taxMode: 'excluded' },
    { name: 'MacBook Air M3 13"', price: 1299, originalPrice: 1499, category: 'electronics', stock: 20, description: 'Supercharged by the M3 chip, 18-hour battery, fanless design.', brand: 'Apple', tags: ['laptop', 'apple', 'macbook', 'm3'], imageUrls: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600'], taxMode: 'excluded' },
    { name: 'AirPods Pro (2nd Gen)', price: 249, originalPrice: 279, category: 'electronics', stock: 80, description: 'Active noise cancellation, Adaptive Audio, H2 chip.', brand: 'Apple', tags: ['earbuds', 'airpods', 'wireless'], imageUrls: ['https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600'], taxMode: 'excluded' },
    { name: 'Dell 27" 4K Monitor', price: 449, originalPrice: 549, category: 'electronics', stock: 25, description: 'IPS panel, 4K UHD, 60Hz, USB-C 90W charging, built-in speakers.', brand: 'Dell', tags: ['monitor', 'display', '4k'], imageUrls: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600'], taxMode: 'included' },
  ],
  'demo.homestyle@gmail.com': [
    { name: 'Minimalist Desk Lamp', price: 45, originalPrice: 59, category: 'home', stock: 70, description: 'Adjustable LED desk lamp with USB charging port and touch dimmer.', brand: 'LumiDesign', tags: ['lamp', 'led', 'desk'], imageUrls: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600'], taxMode: 'none' },
    { name: 'Ergonomic Office Chair', price: 299, originalPrice: 399, category: 'furniture', stock: 15, description: 'Lumbar support, adjustable armrests, breathable mesh back, 5-year warranty.', brand: 'ErgoPlus', tags: ['chair', 'ergonomic', 'office'], imageUrls: ['https://images.unsplash.com/photo-1592078615290-033ee584e267?w=600'], taxMode: 'excluded' },
    { name: 'Bamboo Cutting Board Set', price: 28, originalPrice: 35, category: 'home', stock: 100, description: 'Set of 3 eco-friendly bamboo cutting boards in graduated sizes.', brand: 'EcoKitchen', tags: ['bamboo', 'kitchen', 'eco'], imageUrls: ['https://images.unsplash.com/photo-1591261730799-ee4e6c2d16d7?w=600'], taxMode: 'none' },
  ],
  'demo.harvest@gmail.com': [
    { name: 'Basmati Rice 50kg Sack', price: 89, originalPrice: 110, category: 'food', stock: 800, description: 'Premium long-grain basmati rice in bulk packaging for restaurants and retailers.', brand: 'GoldenGrain', tags: ['rice', 'bulk', 'basmati', 'b2b'], imageUrls: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600'], taxMode: 'excluded', isB2b: true, moq: 5 },
    { name: 'Sunflower Cooking Oil 20L', price: 45, originalPrice: 58, category: 'food', stock: 400, description: 'Refined sunflower oil in 20-litre drums, ideal for commercial kitchens.', brand: 'SunFlow', tags: ['oil', 'cooking', 'bulk', 'b2b'], imageUrls: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600'], taxMode: 'excluded', isB2b: true, moq: 10 },
    { name: 'Sugar 25kg Bag', price: 32, originalPrice: 40, category: 'food', stock: 600, description: 'Refined white sugar in 25kg bags, food-grade quality for wholesale buyers.', brand: 'SweetSource', tags: ['sugar', 'bulk', 'wholesale'], imageUrls: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600'], taxMode: 'excluded', isB2b: true, moq: 20 },
  ],
  'demo.gadgetwh@gmail.com': [
    { name: 'USB-C Cables — 50 Pack', price: 75, originalPrice: 99, category: 'electronics', stock: 200, description: 'Durable braided USB-C to USB-C cables, 2m, 60W fast charge. Bulk pack of 50.', brand: 'CableHub', tags: ['cable', 'usb-c', 'bulk', 'b2b'], imageUrls: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600'], taxMode: 'excluded', isB2b: true, moq: 2 },
    { name: '20000mAh Power Banks — 20 Pack', price: 420, originalPrice: 560, category: 'electronics', stock: 50, description: 'High-capacity power banks with dual USB-A and USB-C output. Reseller pack of 20.', brand: 'PowerXL', tags: ['powerbank', 'charging', 'bulk'], imageUrls: ['https://images.unsplash.com/photo-1586861203927-800a5acdcc4d?w=600'], taxMode: 'excluded', isB2b: true, moq: 1 },
    { name: 'Wireless Earbuds — 30 Pack', price: 360, originalPrice: 480, category: 'electronics', stock: 80, description: 'True wireless earbuds, BT 5.3, 6hr playback. Wholesale pack of 30 with charging cases.', brand: 'SoundDrop', tags: ['earbuds', 'wireless', 'wholesale'], imageUrls: ['https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=600'], taxMode: 'excluded', isB2b: true, moq: 1 },
  ],
  'demo.fashionf@gmail.com': [
    { name: "Men's Classic T-Shirts — 100 Pack", price: 350, originalPrice: 480, category: 'fashion', stock: 300, description: "Cotton blend crew-neck t-shirts. Mix of sizes S-XL, assorted colours. MOQ 100 units.", brand: 'StyleBase', tags: ['tshirt', 'men', 'bulk', 'b2b'], imageUrls: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600'], taxMode: 'none', isB2b: true, moq: 1 },
    { name: "Women's Abaya Collection — 20 Pack", price: 480, originalPrice: 620, category: 'fashion', stock: 150, description: "Flowing abayas in black, navy, and dark grey. Sizes M-XXL. Premium polyester blend.", brand: 'ModestLine', tags: ['abaya', 'women', 'modest', 'wholesale'], imageUrls: ['https://images.unsplash.com/photo-1553775927-a071d5a6a39a?w=600'], taxMode: 'none', isB2b: true, moq: 1 },
    { name: 'Hijab Scarves — 50 Pack', price: 220, originalPrice: 300, category: 'fashion', stock: 400, description: 'Soft jersey hijabs in 10 colour variants. Retail-ready packaging included. Pack of 50.', brand: 'ModestLine', tags: ['hijab', 'scarf', 'women', 'bulk'], imageUrls: ['https://images.unsplash.com/photo-1548142813-c348350df52b?w=600'], taxMode: 'none', isB2b: true, moq: 1 },
  ],
};

/* ── Helpers ────────────────────────────────────────────────────── */
async function ensureAuthUser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name },
  });
  if (!error) return { uid: data.user.id, created: true };
  // Already exists — find and update password
  let page = 1, found = null;
  while (page <= 10 && !found) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    found = list.users.find(u => u.email === email);
    if (list.users.length < 200) break;
    page++;
  }
  if (!found) throw new Error(`create failed and not found: ${email}: ${error.message}`);
  await admin.auth.admin.updateUserById(found.id, { password: PASSWORD, email_confirm: true });
  return { uid: found.id, created: false };
}

async function createAppRecord(type, uid, name) {
  if (type === 'user') {
    const r = await fetch(`${API}/api/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: uid, fullName: name, phone: '', avatar: '👤' }),
    });
    return { status: r.status, supplierId: null };
  }
  const r = await fetch(`${API}/api/suppliers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, authUserId: uid, accountType: type }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, supplierId: body.id ?? body.supplierId ?? null };
}

async function seedProducts(supplierId, products) {
  let ok = 0, fail = 0;
  for (const p of products) {
    const r = await fetch(`${API}/api/products`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, supplierId }),
    });
    if (r.ok) ok++; else fail++;
  }
  return { ok, fail };
}

/* ── Main ────────────────────────────────────────────────────────── */
console.log('\n🚀  Seeding 10 demo accounts...\n');

const results = [];

for (const acc of ACCOUNTS) {
  try {
    const { uid, created } = await ensureAuthUser(acc.email, acc.name);
    const rec = await createAppRecord(acc.type, uid, acc.name);

    let productResult = '';
    const prods = PRODUCTS[acc.email];
    if (prods && rec.supplierId) {
      const { ok, fail } = await seedProducts(rec.supplierId, prods);
      productResult = ` → ${ok} products seeded${fail ? `, ${fail} failed` : ''}`;
    } else if (prods && !rec.supplierId) {
      productResult = ' → ⚠️  no supplierId returned, products skipped';
    }

    console.log(`✅  [${acc.type.padEnd(8)}] ${acc.email.padEnd(30)} uid=${uid} ${created ? 'CREATED' : 'updated '}${productResult}`);
    results.push({ ...acc, uid, status: 'ok' });
  } catch (e) {
    console.log(`❌  [${acc.type.padEnd(8)}] ${acc.email} ERROR: ${e.message}`);
    results.push({ ...acc, status: 'error', error: e.message });
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  DEMO ACCOUNTS — all passwords: Demo1234!');
console.log('══════════════════════════════════════════════════════');
console.log('');
console.log('  CONSUMERS');
console.log('  demo.customer1@gmail.com   Amina Hassan');
console.log('  demo.customer2@gmail.com   Omar Farah');
console.log('');
console.log('  BUSINESSES (POS / Dashboard / Inventory)');
console.log('  demo.freshmart@gmail.com   FreshMart Grocery      (4 food products)');
console.log('  demo.techzone@gmail.com    TechZone Electronics   (4 tech products)');
console.log('  demo.homestyle@gmail.com   HomeStyle Decor        (3 home products)');
console.log('');
console.log('  SUPPLIERS (B2B wholesale catalog)');
console.log('  demo.harvest@gmail.com     Golden Harvest Co.     (3 bulk food)');
console.log('  demo.gadgetwh@gmail.com    Gadget World Wholesale (3 bulk electronics)');
console.log('  demo.fashionf@gmail.com    Fashion Forward Ltd.   (3 bulk fashion)');
console.log('');
console.log('  FIELD AGENTS (shop-only access)');
console.log('  demo.agent1@gmail.com      Khalid Mohamed');
console.log('  demo.agent2@gmail.com      Safia Warsame');
console.log('');
console.log('  Password (all accounts): Demo1234!');
console.log('══════════════════════════════════════════════════════\n');
