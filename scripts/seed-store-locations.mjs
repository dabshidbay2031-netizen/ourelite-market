// Gives every store that has no GPS yet a realistic Mogadishu coordinate so
// the nearby-store search ("closest stores first") has data to rank with.
// Real stores replace this the moment the owner taps "📍 Detect my location"
// in Profile → store settings. Run: node scripts/seed-store-locations.mjs
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

/* Mogadishu district anchors (lat, lng) — stores get a jittered point near one */
const DISTRICTS = [
  ['Hamar Weyne', 2.0361, 45.3419],
  ['Bakara',      2.0480, 45.3210],
  ['Hodan',       2.0530, 45.3070],
  ['Wadajir',     2.0207, 45.2940],
  ['Hamar Jajab', 2.0320, 45.3350],
  ['Waberi',      2.0290, 45.3180],
  ['Yaqshid',     2.0700, 45.3500],
  ['Karan',       2.0800, 45.3600],
  ['Shibis',      2.0500, 45.3480],
  ['Dharkenley',  2.0150, 45.2790],
];

const jitter = () => (Math.random() - 0.5) * 0.012; // ~±650 m

const { data: stores, error } = await admin
  .from('suppliers').select('id, name, latitude, longitude').order('id');
if (error) throw error;

let updated = 0;
for (const s of stores) {
  if (s.latitude != null && s.longitude != null) continue; // never overwrite a real location
  const [district, lat, lng] = DISTRICTS[s.id % DISTRICTS.length];
  const { error: uErr } = await admin
    .from('suppliers')
    .update({ latitude: +(lat + jitter()).toFixed(6), longitude: +(lng + jitter()).toFixed(6) })
    .eq('id', s.id);
  if (uErr) { console.error(`  ✗ #${s.id} ${s.name}: ${uErr.message}`); continue; }
  console.log(`  ✓ #${s.id} ${s.name} → ${district}`);
  updated++;
}
console.log(`Done — ${updated} store(s) got coordinates, ${stores.length - updated} already had one.`);
