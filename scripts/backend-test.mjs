/**
 * Backend test harness for the v3.7 changes (attribution, PII masking,
 * forward-only status, customer scoping, invoice ledger).
 *
 * Usage:  node scripts/backend-test.mjs        (dev server must be running)
 *
 * Uses the seeded test accounts (see seed-credentials.txt) and cleans up
 * everything it creates. Re-run after applying migration_v3_7.sql to
 * exercise the full invoice-payment suite.
 */
// If stdout is piped to a reader that exits early (| head), writes start
// failing with EPIPE — swallow it so the cleanup phase ALWAYS runs.
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const ENVF = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');

const env = {};
for (const line of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const SB_URL  = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON    = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}  ${detail}`); }
}
function note(msg) { console.log(`  NOTE  ${msg}`); }

async function login(email, password) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(d).slice(0, 200)}`);
  return { token: d.access_token, uid: d.user.id };
}

const J = (t) => ({ 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
const api = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, opts);
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
};
const svc = async (path, opts = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers ?? {}) },
  });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
};

const cleanup = [];

try {
  console.log('── setup ──────────────────────────────────');
  const storeA = await login('biz.pharmacy@mogarenta.com', 'Mogarenta2026!');    // the store under test
  const storeB = await login('biz.electronics@mogarenta.com', 'Mogarenta2026!'); // other tenant / reviewer
  console.log('  logged in: City Care Pharmacy + TechHub Electronics');

  const supA = (await api(`/api/suppliers?authUserId=${storeA.uid}`)).body?.[0];
  const supB = (await api(`/api/suppliers?authUserId=${storeB.uid}`)).body?.[0];
  if (!supA?.id || !supB?.id) throw new Error('could not resolve supplier ids');
  console.log(`  store A (pharmacy) id=${supA.id} · store B (electronics) id=${supB.id}`);

  // A product store A sells (claimed via business_products)
  const claims = (await api(`/api/business-products?supplierId=${supA.id}`)).body;
  const claim = Array.isArray(claims) ? claims.find(c => c.isActive && c.product && c.product.stock > 2) : null;
  if (!claim) throw new Error('store A has no claimed product with stock');
  const prodId = claim.productId;
  const prodBefore = (await svc(`products?id=eq.${prodId}&select=stock,sold,rating,reviews`)).body[0];
  console.log(`  test product #${prodId} (${claim.product.name}) stock=${prodBefore.stock}`);
  cleanup.push(async () => {
    await svc(`products?id=eq.${prodId}`, { method: 'PATCH', body: JSON.stringify(prodBefore) });
    console.log('  cleanup: restored product stock/sold/rating/reviews');
  });
  // The attributed test review rewrites store A's profile rating (that's the
  // feature) — snapshot it so cleanup puts the pre-test numbers back.
  const supABefore = (await svc(`suppliers?id=eq.${supA.id}&select=rating,reviews`)).body[0];
  cleanup.push(async () => {
    await svc(`suppliers?id=eq.${supA.id}`, { method: 'PATCH', body: JSON.stringify(supABefore) });
    console.log('  cleanup: restored store rating/review count');
  });

  console.log('\n── 1. orders list: auth + tenant scoping ──');
  check('GET /api/orders?supplierId (no token) → 401',
    (await api(`/api/orders?supplierId=${supA.id}`)).status === 401);
  const listOwn = await api(`/api/orders?supplierId=${supA.id}`, { headers: J(storeA.token) });
  check('GET /api/orders?supplierId (owner) → 200 + array',
    listOwn.status === 200 && Array.isArray(listOwn.body), `got ${listOwn.status}`);
  check('GET /api/orders?supplierId (OTHER store) → 403',
    (await api(`/api/orders?supplierId=${supA.id}`, { headers: J(storeB.token) })).status === 403);

  console.log('\n── 2. order create (attribution) ──────────');
  const create = await api('/api/orders', {
    method: 'POST', headers: J(),
    body: JSON.stringify({
      customerName: 'Backend Test Buyer', customerPhone: '+252611234599',
      items: [{ id: prodId, qty: 1 }], paymentMethod: 'cash', supplierId: supA.id,
      notes: 'backend-test order — safe to ignore',
    }),
  });
  check('POST /api/orders → 201', create.status === 201, JSON.stringify(create.body).slice(0, 150));
  const orderId = create.body?.id;
  console.log(`  order id: ${orderId}`);
  cleanup.push(async () => {
    await svc(`orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    console.log('  cleanup: removed test order');
  });
  note(`response supplierId = ${JSON.stringify(create.body?.supplierId)} ` +
    (create.body?.supplierId != null ? '(migration applied — attribution stored)' : '(null — expected until migration_v3_7.sql is run)'));

  console.log('\n── 3. order GET: PII masking ──────────────');
  const anon = await api(`/api/orders/${orderId}`);
  check('unauthenticated GET is masked', anon.body?.masked === true);
  check('masked name/phone/notes',
    anon.body?.customerName === 'B.' && String(anon.body?.customerPhone).endsWith('99') &&
    !String(anon.body?.customerPhone).includes('1234') && anon.body?.notes === null,
    JSON.stringify({ n: anon.body?.customerName, p: anon.body?.customerPhone, notes: anon.body?.notes }));
  const sellerView = await api(`/api/orders/${orderId}`, { headers: J(storeA.token) });
  check('seller GET is unmasked', sellerView.body?.masked === undefined && sellerView.body?.customerName === 'Backend Test Buyer');
  const strangerView = await api(`/api/orders/${orderId}`, { headers: J(storeB.token) });
  check('other-store GET is masked', strangerView.body?.masked === true);

  console.log('\n── 4. status: forward-only + seller-only ──');
  const patch = (token, status) => api(`/api/orders/${orderId}`, {
    method: 'PATCH', headers: J(token), body: JSON.stringify({ status }),
  });
  check('PATCH by non-seller store → 403', (await patch(storeB.token, 'processing')).status === 403);
  check('pending → processing → 200', (await patch(storeA.token, 'processing')).status === 200);
  const back = await patch(storeA.token, 'pending');
  check('processing → pending → 409', back.status === 409, JSON.stringify(back.body));
  check('processing → shipped → 200', (await patch(storeA.token, 'shipped')).status === 200);
  check('shipped → completed → 200', (await patch(storeA.token, 'completed')).status === 200);
  check('completed → processing → 409', (await patch(storeA.token, 'processing')).status === 409);
  const del = await api(`/api/orders/${orderId}`, { method: 'DELETE', headers: J(storeA.token) });
  check('soft delete → 200 + softDeleted', del.status === 200 && del.body?.softDeleted === true);
  check('deleted → completed → 409 (terminal)', (await patch(storeA.token, 'completed')).status === 409);

  console.log('\n── 5. reviews: attribution + aggregates ───');
  const revNoAuth = await api('/api/reviews', {
    method: 'POST', headers: J(),
    body: JSON.stringify({ productId: prodId, rating: 5 }),
  });
  check('POST /api/reviews (no token) → 401', revNoAuth.status === 401);
  const rev = await api('/api/reviews', {
    method: 'POST', headers: J(storeB.token),
    body: JSON.stringify({
      productId: prodId, rating: 4, comment: 'backend-test review',
      userName: 'Backend Tester', supplierId: supA.id,
    }),
  });
  check('POST /api/reviews (token + supplierId) → 201', rev.status === 201, JSON.stringify(rev.body).slice(0, 150));
  cleanup.push(async () => {
    await svc(`reviews?product_id=eq.${prodId}&user_id=eq.${storeB.uid}`, { method: 'DELETE' });
    console.log('  cleanup: removed test review');
  });
  note(`review supplierId = ${JSON.stringify(rev.body?.supplierId)} ` +
    (rev.body?.supplierId != null ? '(attribution stored)' : '(null — expected until migration)'));
  const revList = await api(`/api/reviews?productId=${prodId}`);
  check('GET /api/reviews lists the new review',
    Array.isArray(revList.body) && revList.body.some(r => r.comment === 'backend-test review'));
  // The API recomputes the product's rating/count from the reviews TABLE
  // (seeded demo counters get replaced by the real numbers) — assert against
  // the table, not the previous counter.
  const realRows = (await svc(`reviews?product_id=eq.${prodId}&select=rating`)).body;
  const realAvg  = Math.round((realRows.reduce((s, r) => s + r.rating, 0) / realRows.length) * 10) / 10;
  const prodAfterRev = (await svc(`products?id=eq.${prodId}&select=rating,reviews`)).body[0];
  check('product rating/count recalculated from real reviews',
    prodAfterRev.reviews === realRows.length && prodAfterRev.rating === realAvg,
    `product says ${prodAfterRev.rating}/${prodAfterRev.reviews}, table says ${realAvg}/${realRows.length}`);
  const supAfterRev = (await api(`/api/suppliers?authUserId=${storeA.uid}`)).body?.[0];
  note(`store rating now ${supAfterRev?.rating} (${supAfterRev?.reviews} reviews) — updates from attributed reviews only (needs migration)`);

  console.log('\n── 6. customers: tenant scoping ───────────');
  check('GET /api/customers?supplierId (no token) → 401',
    (await api(`/api/customers?supplierId=${supA.id}`)).status === 401);
  check('GET /api/customers?supplierId (OTHER store) → 403',
    (await api(`/api/customers?supplierId=${supA.id}`, { headers: J(storeB.token) })).status === 403);
  const custList = await api(`/api/customers?supplierId=${supA.id}`, { headers: J(storeA.token) });
  check('GET /api/customers?supplierId (owner) → 200 + array',
    custList.status === 200 && Array.isArray(custList.body), `got ${custList.status}`);
  const custCreate = await api('/api/customers', {
    method: 'POST', headers: J(storeA.token),
    body: JSON.stringify({ name: 'Backend Test Customer', phone: '+252610000000', supplierId: supA.id }),
  });
  check('POST /api/customers → 201', custCreate.status === 201, JSON.stringify(custCreate.body).slice(0, 150));
  const custId = custCreate.body?.id;
  if (custId) cleanup.push(async () => {
    await api(`/api/customers/${custId}`, { method: 'DELETE', headers: J(storeA.token) });
    console.log('  cleanup: removed test customer');
  });
  note(`customer supplierId = ${JSON.stringify(custCreate.body?.supplierId)} ` +
    (custCreate.body?.supplierId != null ? '(scoped)' : '(null — shared until migration)'));

  console.log('\n── 7. invoices (needs migration_v3_7) ─────');
  const invList = await api(`/api/invoices?supplierId=${supA.id}`, { headers: J(storeA.token) });
  check('GET /api/invoices (owner) → 200 + array (or graceful [] pre-migration)',
    invList.status === 200 && Array.isArray(invList.body), `got ${invList.status}: ${JSON.stringify(invList.body).slice(0, 120)}`);
  check('GET /api/invoices (no token) → 401',
    (await api(`/api/invoices?supplierId=${supA.id}`)).status === 401);
  check('GET /api/invoices (OTHER store) → 403',
    (await api(`/api/invoices?supplierId=${supA.id}`, { headers: J(storeB.token) })).status === 403);
  const invCreate = await api('/api/invoices', {
    method: 'POST', headers: J(storeA.token),
    body: JSON.stringify({
      supplierId: supA.id, customerId: custId ?? 'test', customerName: 'Backend Test Customer',
      items: [{ id: prodId, name: claim.product.name, price: 9.99, qty: 2 }],
      discount: 1, notes: 'backend-test invoice',
    }),
  });
  if (invCreate.status === 201) {
    check('POST /api/invoices → 201', true);
    const invId = invCreate.body.id;
    cleanup.push(async () => {
      await svc(`invoices?id=eq.${invId}`, { method: 'DELETE' });
      console.log('  cleanup: removed test invoice');
    });
    check('invoice math: total = 2×9.99 − 1 = 18.98',
      invCreate.body.total === 18.98 && invCreate.body.balance === 18.98 && invCreate.body.status === 'unpaid',
      JSON.stringify({ t: invCreate.body.total, b: invCreate.body.balance, s: invCreate.body.status }));

    const overpay = await api(`/api/invoices/${invId}`, {
      method: 'PATCH', headers: J(storeA.token),
      body: JSON.stringify({ payment: { amount: 999, method: 'cash' } }),
    });
    check('overpayment rejected → 400', overpay.status === 400, JSON.stringify(overpay.body));
    const pay1 = await api(`/api/invoices/${invId}`, {
      method: 'PATCH', headers: J(storeA.token),
      body: JSON.stringify({ payment: { amount: 10, method: 'waafi' } }),
    });
    check('partial payment → status partial, balance 8.98',
      pay1.status === 200 && pay1.body.status === 'partial' && pay1.body.balance === 8.98,
      JSON.stringify({ s: pay1.body?.status, b: pay1.body?.balance }));
    const pay2 = await api(`/api/invoices/${invId}`, {
      method: 'PATCH', headers: J(storeA.token),
      body: JSON.stringify({ payment: { amount: 8.98, method: 'cash' } }),
    });
    check('final payment → status paid, balance 0',
      pay2.status === 200 && pay2.body.status === 'paid' && pay2.body.balance === 0,
      JSON.stringify({ s: pay2.body?.status, b: pay2.body?.balance }));
    check('payment history has 2 entries with dates/methods',
      Array.isArray(pay2.body.payments) && pay2.body.payments.length === 2 &&
      pay2.body.payments.every(p => p.paidAt && p.method));
    const payAgain = await api(`/api/invoices/${invId}`, {
      method: 'PATCH', headers: J(storeA.token),
      body: JSON.stringify({ payment: { amount: 1, method: 'cash' } }),
    });
    check('payment on fully-paid invoice → 409', payAgain.status === 409);
    const invForeign = await api(`/api/invoices/${invId}`, { headers: J(storeB.token) });
    check('GET invoice by OTHER store → 403', invForeign.status === 403);
  } else {
    note(`POST /api/invoices → ${invCreate.status}: ${JSON.stringify(invCreate.body).slice(0, 160)}`);
    check('pre-migration failure is the explicit needsMigration error',
      invCreate.body?.needsMigration === true,
      'expected a clear needsMigration error');
    note('invoice payment tests SKIPPED — run supabase/migration_v3_7.sql and re-run this script');
  }
} catch (e) {
  fail++;
  console.error('ABORTED:', e.message);
} finally {
  console.log('\n── cleanup ────────────────────────────────');
  for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.log('  cleanup error:', e.message); } }
  console.log(`\n══ RESULT: ${pass} passed, ${fail} failed ══`);
  if (failures.length) console.log('failed:', failures.join(' | '));
  process.exit(fail ? 1 : 0);
}
