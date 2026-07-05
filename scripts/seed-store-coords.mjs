// Gives each demo business/supplier a map pin (Mogadishu area) so the
// store-profile map + route feature is visible.
// Requires the suppliers.latitude/longitude columns (migration_v3_1 §6).
// Run: node scripts/seed-store-coords.mjs
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

// Pins scattered around central Mogadishu
const PINS = {
  'FreshMart Grocery':      { latitude: 2.0411, longitude: 45.3438 },
  'TechZone Electronics':   { latitude: 2.0469, longitude: 45.3182 },
  'HomeStyle Decor':        { latitude: 2.0375, longitude: 45.3290 },
  'Golden Harvest Co.':     { latitude: 2.0530, longitude: 45.3401 },
  'Gadget World Wholesale': { latitude: 2.0288, longitude: 45.3115 },
  'Fashion Forward Ltd.':   { latitude: 2.0602, longitude: 45.3267 },
};

// Probe columns first
const probe = await sb.from('suppliers').select('latitude,longitude').limit(1);
if (probe.error) {
  console.log('\n❌  suppliers.latitude/longitude columns are missing.');
  console.log('    Run this in the Supabase SQL editor first:\n');
  console.log('    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;');
  console.log('    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;\n');
  process.exit(1);
}

let ok = 0;
for (const [name, pin] of Object.entries(PINS)) {
  const { error } = await sb.from('suppliers').update(pin).eq('name', name);
  if (error) console.log(`❌  ${name}: ${error.message}`);
  else { console.log(`✅  ${name.padEnd(24)} → ${pin.latitude}, ${pin.longitude}`); ok++; }
}
console.log(`\n${ok}/${Object.keys(PINS).length} store pins set. Open any store profile to see the map.\n`);
