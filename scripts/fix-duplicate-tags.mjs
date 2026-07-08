// Dedupes + trims product tags in the DB — seeded rows contained duplicates
// like ['electronics','electronics'], which broke React list keys and
// double-counted in similar-product scoring.
// Run: node scripts/fix-duplicate-tags.mjs
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

const { data: products, error } = await admin.from('products').select('id, name, tags');
if (error) throw error;

let fixed = 0;
for (const p of products) {
  if (!Array.isArray(p.tags) || p.tags.length === 0) continue;
  const clean = [...new Set(p.tags.map(t => String(t).trim()).filter(Boolean))];
  if (clean.length === p.tags.length && clean.every((t, i) => t === p.tags[i])) continue;
  const { error: uErr } = await admin.from('products').update({ tags: clean }).eq('id', p.id);
  if (uErr) { console.error(`  ✗ #${p.id} ${p.name}: ${uErr.message}`); continue; }
  fixed++;
}
console.log(`Done — cleaned tags on ${fixed} product(s) out of ${products.length}.`);
