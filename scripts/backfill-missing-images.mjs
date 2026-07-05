// Backfills product photos for any catalog row missing image_url/image_urls
// (e.g. the field-agent demo seed never set any). Uses the same
// loremflickr.com category-keyword pattern as seed-niche-businesses.mjs so
// it's visually consistent with the rest of the catalog.
// Run: node scripts/backfill-missing-images.mjs
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

const photo = (kw, lock) => `https://loremflickr.com/600/600/${encodeURIComponent(kw)}?lock=${lock}`;

const KEYWORDS = {
  electronics: 'electronics,gadget',
  fashion:     'fashion,clothing',
  home:        'home,decor',
  food:        'food,grocery',
  health:      'health,wellness',
  sports:      'sports,fitness',
  furniture:   'furniture,interior',
  medicine:    'medicine,pharmacy',
  cosmetics:   'cosmetics,beauty',
  construction:'construction,tools',
  cars:        'car,automotive',
  books:       'books,reading',
  other:       'shopping,product',
};

async function main() {
  const { data: rows, error } = await sb
    .from('products').select('id, name, category, image_url, image_urls');
  if (error) { console.error(error.message); process.exit(1); }

  const missing = (rows ?? []).filter(p => !p.image_url && (!p.image_urls || p.image_urls.length === 0));
  console.log(`Found ${missing.length} products with no photo.`);

  let updated = 0;
  for (const p of missing) {
    const kw   = KEYWORDS[p.category] || KEYWORDS.other;
    const lock = p.id * 7; // deterministic per-product, spread across the keyword pool
    const urls = [photo(kw, lock), photo(kw, lock + 1), photo(kw, lock + 2)];
    const { error: upErr } = await sb.from('products')
      .update({ image_url: urls[0], image_urls: urls })
      .eq('id', p.id);
    if (upErr) console.log(`  ${p.id} ${p.name}: FAILED — ${upErr.message}`);
    else updated++;
  }
  console.log(`Backfilled ${updated}/${missing.length} products.`);
}

main().catch(e => { console.error(e); process.exit(1); });
