// Gives every store without a slug a clean shareable link derived from its
// name (TechZone Electronics → /techzone-electronics), deduped with -2, -3…
// Never touches stores that already chose a slug.
// Run: node scripts/backfill-store-slugs.mjs
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

/* Mirrors lib/slug.ts (scripts can't import TS) */
const RESERVED = new Set([
  'dashboard','my-dashboard','inventory','customers','suppliers','supplier',
  'orders','pos','settings','profile','checkout','chat','notifications',
  'search','product','admin','staff','cashier-login','auth','api',
  'privacy','terms','payment','payments','legal','help','support',
  'about','contact','login','signup','signin','register','logout',
  'www','app','mail','blog','news','store','shop','stores',
  'mogarenta','official','null','undefined',
]);
const slugify = name => String(name ?? '')
  .toLowerCase().normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 30)
  .replace(/-$/, '');

const { data: stores, error } = await admin
  .from('suppliers').select('id, name, slug').order('id');
if (error) throw error;

const taken = new Set(stores.map(s => s.slug).filter(Boolean));
let updated = 0, skipped = 0;

for (const s of stores) {
  if (s.slug) continue; // owner already has a link
  const base = slugify(s.name);
  if (!base || base.length < 3 || RESERVED.has(base)) { console.log(`  – #${s.id} "${s.name}" → no valid slug, skipped`); skipped++; continue; }
  let candidate = base;
  for (let i = 2; taken.has(candidate) || RESERVED.has(candidate); i++) {
    candidate = `${base.slice(0, 30 - String(i).length - 1)}-${i}`;
  }
  const { error: uErr } = await admin.from('suppliers').update({ slug: candidate }).eq('id', s.id);
  if (uErr) { console.error(`  ✗ #${s.id} ${s.name}: ${uErr.message}`); continue; }
  taken.add(candidate);
  console.log(`  ✓ #${s.id} ${s.name} → /${candidate}`);
  updated++;
}
console.log(`Done — ${updated} store link(s) created, ${skipped} skipped, ${stores.filter(s => s.slug).length} already had one.`);
