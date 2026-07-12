/**
 * Backend test harness #2 — deep scenarios on top of scripts/backend-test.mjs:
 *   • cross-store claimed-product attribution (the dashboard fix)
 *   • legacy (unattributed) order fallback matching
 *   • buyer sees own order unmasked
 *   • insufficient-stock rejection
 *   • review upsert (no duplicates), multi-reviewer store-rating average,
 *     and catalog-owner fallback attribution
 *   • POS session totals + close (verifies RPC-path session stamping)
 *   • customer legacy-null visibility vs scoped rows
 *   • invoice validation + customerId filter + cross-tenant create
 *
 * Usage:  node scripts/backend-test-2.mjs   (dev server on :3001, v3.7 migration applied)
 * Self-cleaning: removes every row it creates and restores all touched stats.
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
  // Occasional transient "fetch failed" against the auth endpoint — retry.
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!d.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(d).slice(0, 160)}`);
      return { token: d.access_token, uid: d.user.id };
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise(res => setTimeout(res, 1500 * attempt));
    }
  }
}
const J = (t) => ({ 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
const api = async (p, o = {}) => {
  const r = await fetch(`${BASE}${p}`, o);
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
};
const svc = async (p, o = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, {
    ...o, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers ?? {}) },
  });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
};
const admin = async (p, o = {}) => {
  const r = await fetch(`${SB_URL}/auth/v1/admin/${p}`, {
    ...o, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(o.headers ?? {}) },
  });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
};

const cleanup = [];
const snapProduct = async (id) => {
  const before = (await svc(`products?id=eq.${id}&select=stock,sold,rating,reviews`)).body[0];
  cleanup.push(async () => {
    await svc(`products?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(before) });
    console.log(`  cleanup: restored product #${id}`);
  });
  return before;
};
const snapStore = async (id) => {
  const before = (await svc(`suppliers?id=eq.${id}&select=rating,reviews`)).body[0];
  cleanup.push(async () => {
    await svc(`suppliers?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(before) });
    console.log(`  cleanup: restored store #${id} rating`);
  });
  return before;
};
const dropOrder = (id) => cleanup.push(async () => {
  await svc(`orders?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  console.log(`  cleanup: removed test order ${id}`);
});

try {
  console.log('── setup ──────────────────────────────────');
  const A = await login('biz.pharmacy@mogarenta.com', 'Mogarenta2026!');
  const B = await login('biz.electronics@mogarenta.com', 'Mogarenta2026!');
  const supA = (await api(`/api/suppliers?authUserId=${A.uid}`)).body?.[0];
  const supB = (await api(`/api/suppliers?authUserId=${B.uid}`)).body?.[0];
  console.log(`  store A (pharmacy) id=${supA.id} · store B (electronics) id=${supB.id}`);

  const claimsA = (await api(`/api/business-products?supplierId=${supA.id}`)).body;
  const claimsB = (await api(`/api/business-products?supplierId=${supB.id}`)).body;
  const bIds = new Set(claimsB.map(c => c.productId));
  const pick = claimsA.filter(c => c.isActive && c.product && c.product.stock > 10);
  const P  = pick[0];                                   // shared-claim test product
  // P2 must be a DIFFERENT product B does not sell, so the "buyer sees own
  // order" check exercises the buyer path, not the seller path.
  const P2 = pick.find(c => !bIds.has(c.productId) && c.productId !== P.productId);
  if (!P || !P2) throw new Error('need two distinct claimed products with stock');
  console.log(`  P=#${P.productId} (${P.product.name}) · P2=#${P2.productId} (${P2.product.name})`);
  await snapProduct(P.productId);
  await snapProduct(P2.productId);
  await snapStore(supA.id);

  // Store B claims P too — the exact "same claimed product, two stores" case
  let tempClaimId = null;
  if (!bIds.has(P.productId)) {
    const claim = await api('/api/business-products', {
      method: 'POST', headers: J(B.token),
      body: JSON.stringify({ supplierId: supB.id, productId: P.productId, customPrice: 12.34, stockQty: 5 }),
    });
    if (claim.status !== 200 && claim.status !== 201) throw new Error(`claim failed: ${JSON.stringify(claim.body).slice(0, 120)}`);
    tempClaimId = claim.body.id;
    cleanup.push(async () => {
      await svc(`business_products?id=eq.${tempClaimId}`, { method: 'DELETE' });
      console.log('  cleanup: removed store B temp claim');
    });
    console.log(`  store B temporarily claims P (bp #${tempClaimId})`);
  } else {
    note('store B already claims P — using existing claim');
  }

  console.log('\n── 1. attribution vs shared claims ────────');
  const o1 = await api('/api/orders', {
    method: 'POST', headers: J(),
    body: JSON.stringify({
      customerName: 'Attribution Test', customerPhone: '+252611111111',
      items: [{ id: P.productId, qty: 1 }], paymentMethod: 'cash', supplierId: supA.id,
    }),
  });
  check('order attributed to A created', o1.status === 201 && o1.body.supplierId === supA.id);
  dropOrder(o1.body.id);
  const listA = (await api(`/api/orders?supplierId=${supA.id}`, { headers: J(A.token) })).body;
  const listB = (await api(`/api/orders?supplierId=${supB.id}`, { headers: J(B.token) })).body;
  check("A's list contains the order", listA.some(o => o.id === o1.body.id));
  check("B's list does NOT contain it (despite claiming the same product)",
    !listB.some(o => o.id === o1.body.id));

  // Legacy order (no supplier_id) containing P → both stores see it (fallback)
  const legacyId = `TEST-LEGACY-${Date.now().toString(36).toUpperCase()}`;
  const legacyIns = await svc('orders', {
    method: 'POST',
    body: JSON.stringify({
      id: legacyId, customer_name: 'Legacy Test', customer_phone: '',
      items: [{ id: P.productId, qty: 1 }], subtotal: 1, discount: 0, total: 1,
      payment_method: 'cash', status: 'completed',
    }),
  });
  check('legacy (unattributed) order inserted', legacyIns.status === 201, JSON.stringify(legacyIns.body).slice(0, 120));
  dropOrder(legacyId);
  const listA2 = (await api(`/api/orders?supplierId=${supA.id}`, { headers: J(A.token) })).body;
  const listB2 = (await api(`/api/orders?supplierId=${supB.id}`, { headers: J(B.token) })).body;
  check('legacy order visible to A (item-match fallback)', listA2.some(o => o.id === legacyId));
  check('legacy order visible to B (item-match fallback)', listB2.some(o => o.id === legacyId));

  console.log('\n── 2. buyer sees own order unmasked ───────');
  const o2 = await api('/api/orders', {
    method: 'POST', headers: J(),
    body: JSON.stringify({
      customerName: 'Buyer Test', customerPhone: '+252612222222', userId: B.uid,
      items: [{ id: P2.productId, qty: 1 }], paymentMethod: 'cash', supplierId: supA.id,
    }),
  });
  check('order placed with B as the buyer', o2.status === 201);
  dropOrder(o2.body.id);
  const buyerView = await api(`/api/orders/${o2.body.id}`, { headers: J(B.token) });
  check('buyer (not seller) sees full details',
    buyerView.body?.masked === undefined && buyerView.body?.customerName === 'Buyer Test');
  const anonView = await api(`/api/orders/${o2.body.id}`);
  check('anonymous still masked', anonView.body?.masked === true);

  console.log('\n── 3. insufficient stock ──────────────────');
  const big = await api('/api/orders', {
    method: 'POST', headers: J(),
    body: JSON.stringify({
      customerName: 'Stock Test', items: [{ id: P.productId, qty: 9999 }], paymentMethod: 'cash',
    }),
  });
  check('qty > stock → 409', big.status === 409, `got ${big.status}: ${JSON.stringify(big.body).slice(0, 100)}`);

  console.log('\n── 4. reviews: upsert, average, fallback ──');
  const postReview = (token, productId, rating, supplierId) => api('/api/reviews', {
    method: 'POST', headers: J(token),
    body: JSON.stringify({ productId, rating, comment: 'backend-test-2', userName: 'T', supplierId }),
  });
  check('review #1 (rating 2) saved', (await postReview(B.token, P.productId, 2, supA.id)).status === 201);
  check('re-review by same user (rating 4) upserts', (await postReview(B.token, P.productId, 4, supA.id)).status === 201);
  cleanup.push(async () => {
    await svc(`reviews?product_id=eq.${P.productId}&user_id=eq.${B.uid}`, { method: 'DELETE' });
    console.log('  cleanup: removed B review');
  });
  const revs = (await api(`/api/reviews?productId=${P.productId}`)).body;
  const mine = revs.filter(r => r.userId === B.uid);
  check('no duplicate — one review per user, latest rating', mine.length === 1 && mine[0].rating === 4,
    `count=${mine.length} rating=${mine[0]?.rating}`);

  // Second reviewer (temp auth user) → store rating = avg(4, 2) = 3
  const tmpEmail = `backend.test.tmp.${Date.now()}@mogarenta.com`;
  const created = await admin('users', {
    method: 'POST', body: JSON.stringify({ email: tmpEmail, password: 'Mogarenta2026!', email_confirm: true }),
  });
  if (!created.body?.id) throw new Error(`temp user create failed: ${JSON.stringify(created.body).slice(0, 120)}`);
  const tmpUid = created.body.id;
  cleanup.push(async () => {
    await admin(`users/${tmpUid}`, { method: 'DELETE' });
    console.log('  cleanup: removed temp auth user');
  });
  const T = await login(tmpEmail, 'Mogarenta2026!');
  check('review #2 by second user saved', (await postReview(T.token, P.productId, 2, supA.id)).status === 201);
  cleanup.push(async () => {
    await svc(`reviews?user_id=eq.${tmpUid}`, { method: 'DELETE' });
    console.log('  cleanup: removed temp-user reviews');
  });
  const storeAfter = (await svc(`suppliers?id=eq.${supA.id}&select=rating,reviews`)).body[0];
  check('store rating = avg(4,2) = 3 across 2 attributed reviews',
    storeAfter.rating === 3 && storeAfter.reviews === 2,
    JSON.stringify(storeAfter));

  // No supplierId sent → attribution falls back to the catalog owner
  const ownerId = (await svc(`products?id=eq.${P2.productId}&select=supplier_id`)).body[0].supplier_id;
  if (ownerId != null) await snapStore(ownerId);
  check('review without supplierId saved', (await postReview(T.token, P2.productId, 5, undefined)).status === 201);
  const fbRow = (await svc(`reviews?product_id=eq.${P2.productId}&user_id=eq.${tmpUid}&select=supplier_id`)).body[0];
  check('fallback attribution = catalog owner', fbRow?.supplier_id === ownerId,
    `row=${JSON.stringify(fbRow)} owner=${ownerId}`);

  console.log('\n── 5. POS session totals ──────────────────');
  const sess = await api('/api/pos-sessions', {
    method: 'POST', headers: J(A.token),
    body: JSON.stringify({ openedBy: A.uid, cashierName: 'Backend Test', openingFloat: 50 }),
  });
  check('register opened', sess.status === 201 && sess.body.status === 'open');
  const sessId = sess.body.id;
  cleanup.push(async () => {
    await svc(`pos_sessions?id=eq.${sessId}`, { method: 'DELETE' });
    console.log('  cleanup: removed test POS session');
  });
  const o3 = await api('/api/orders', {
    method: 'POST', headers: J(),
    body: JSON.stringify({
      customerName: 'POS Test', items: [{ id: P.productId, qty: 2 }],
      paymentMethod: 'cash', sessionId: sessId, cashierName: 'Backend Test', supplierId: supA.id,
    }),
  });
  check('POS sale placed', o3.status === 201);
  dropOrder(o3.body.id);
  check('order carries the session (RPC-path stamping)', o3.body.sessionId === sessId,
    `sessionId=${JSON.stringify(o3.body.sessionId)}`);
  const report = (await api(`/api/pos-sessions/${sessId}`)).body;
  check('session report counts the sale',
    report.totalOrders === 1 && report.cashRevenue === o3.body.total &&
    report.expectedCash === 50 + o3.body.total,
    JSON.stringify({ n: report.totalOrders, cash: report.cashRevenue, exp: report.expectedCash }));
  const close = await api(`/api/pos-sessions/${sessId}`, {
    method: 'PATCH', headers: J(A.token),
    body: JSON.stringify({ closingCounted: 50 + o3.body.total }),
  });
  check('register closes with zero discrepancy',
    close.status === 200 && close.body.status === 'closed' && close.body.discrepancy === 0,
    JSON.stringify({ s: close.body?.status, d: close.body?.discrepancy }));

  console.log('\n── 6. customers: legacy vs scoped ─────────');
  const legacyCust = await svc('customers', {
    method: 'POST', body: JSON.stringify({ name: 'Legacy Shared Test', phone: '000' }),
  });
  const legacyCustId = legacyCust.body?.[0]?.id;
  cleanup.push(async () => {
    await svc(`customers?id=eq.${legacyCustId}`, { method: 'DELETE' });
    console.log('  cleanup: removed legacy test customer');
  });
  const scopedCust = await api('/api/customers', {
    method: 'POST', headers: J(A.token),
    body: JSON.stringify({ name: 'Scoped A Test', phone: '111', supplierId: supA.id }),
  });
  const scopedCustId = scopedCust.body?.id;
  cleanup.push(async () => {
    await svc(`customers?id=eq.${scopedCustId}`, { method: 'DELETE' });
    console.log('  cleanup: removed scoped test customer');
  });
  const custA = (await api(`/api/customers?supplierId=${supA.id}`, { headers: J(A.token) })).body;
  const custB = (await api(`/api/customers?supplierId=${supB.id}`, { headers: J(B.token) })).body;
  check('legacy (null) customer visible to A', custA.some(c => String(c.id) === String(legacyCustId)));
  check('legacy (null) customer visible to B', custB.some(c => String(c.id) === String(legacyCustId)));
  check("A's scoped customer visible to A", custA.some(c => String(c.id) === String(scopedCustId)));
  check("A's scoped customer HIDDEN from B", !custB.some(c => String(c.id) === String(scopedCustId)));

  console.log('\n── 7. invoices: validation + filter ───────');
  check('empty items → 400', (await api('/api/invoices', {
    method: 'POST', headers: J(A.token),
    body: JSON.stringify({ supplierId: supA.id, customerId: scopedCustId, items: [] }),
  })).status === 400);
  // NOTE: the attack direction matters — biz.pharmacy is ALSO a platform
  // admin (admins table, added 2026-07-08), and admins may act on any store
  // by design. Store B (electronics) is a plain business, so it's the one
  // that must be rejected.
  check("creating an invoice on ANOTHER store → 403", (await api('/api/invoices', {
    method: 'POST', headers: J(B.token),
    body: JSON.stringify({ supplierId: supA.id, customerId: scopedCustId, items: [{ id: 1, name: 'x', price: 1, qty: 1 }] }),
  })).status === 403);
  const mkInv = (custId) => api('/api/invoices', {
    method: 'POST', headers: J(A.token),
    body: JSON.stringify({
      supplierId: supA.id, customerId: custId, customerName: 'Filter Test',
      items: [{ id: P.productId, name: P.product.name, price: 5, qty: 1 }],
    }),
  });
  const inv1 = await mkInv(String(scopedCustId));
  const inv2 = await mkInv(String(legacyCustId));
  check('two invoices created', inv1.status === 201 && inv2.status === 201);
  cleanup.push(async () => {
    await svc(`invoices?id=in.(${JSON.stringify(inv1.body.id)},${JSON.stringify(inv2.body.id)})`, { method: 'DELETE' });
    console.log('  cleanup: removed test invoices');
  });
  const filtered = (await api(`/api/invoices?supplierId=${supA.id}&customerId=${encodeURIComponent(scopedCustId)}`, { headers: J(A.token) })).body;
  check('customerId filter returns only that customer',
    Array.isArray(filtered) && filtered.some(v => v.id === inv1.body.id) &&
    filtered.every(v => String(v.customerId) === String(scopedCustId)),
    JSON.stringify(filtered?.map?.(v => v.customerId)));
} catch (e) {
  fail++;
  console.error('ABORTED:', e.message, '| cause:', e.cause?.message ?? e.cause ?? 'n/a', e.stack?.split('\n')[1] ?? '');
} finally {
  console.log('\n── cleanup ────────────────────────────────');
  for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.log('  cleanup error:', e.message); } }
  console.log(`\n══ RESULT: ${pass} passed, ${fail} failed ══`);
  if (failures.length) console.log('failed:', failures.join(' | '));
  process.exit(fail ? 1 : 0);
}
