// One-off: create confirmed test users via the Supabase admin API, then
// create their app records (profile / supplier) through the local API routes.
// Run while the dev server is up on :3001.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ---- load .env.local ----
const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const API = 'http://localhost:3001';

const USERS = [
  { type: 'user',     name: 'Test Customer', email: 'mogatest.cust@gmail.com'  },
  { type: 'business', name: 'TechVault Store', email: 'mogatest.biz@gmail.com'  },
  { type: 'supplier', name: 'Acme Wholesale Co.', email: 'mogatest.sup@gmail.com' },
  { type: 'agent',    name: 'Field Agent Mo', email: 'mogatest.agent@gmail.com' },
];
const PASSWORD = 'password123';

async function ensureAuthUser(email, name) {
  // Try create; if exists, look it up and update the password + confirm.
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name },
  });
  if (!error) return { uid: data.user.id, created: true };
  // Already exists — find by listing
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

async function createRecord(type, uid, name) {
  if (type === 'user') {
    const r = await fetch(`${API}/api/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: uid, fullName: name, phone: '', avatar: '👤' }),
    });
    return { status: r.status, body: await r.text() };
  }
  const r = await fetch(`${API}/api/suppliers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, authUserId: uid, accountType: type }),
  });
  return { status: r.status, body: await r.text() };
}

for (const u of USERS) {
  try {
    const { uid, created } = await ensureAuthUser(u.email, u.name);
    const rec = await createRecord(u.type, uid, u.name);
    console.log(`[${u.type}] ${u.email} uid=${uid} authCreated=${created} record=${rec.status} ${rec.body.slice(0, 120)}`);
  } catch (e) {
    console.log(`[${u.type}] ${u.email} ERROR ${e.message}`);
  }
}
console.log('done');
