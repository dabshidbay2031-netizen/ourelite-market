// Seeds realistic activity for all 10 demo accounts:
//   orders, reviews, conversations + messages
// Run while dev server is on :3000:
//   node scripts/seed-demo-activity.mjs
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

/* ── Known UIDs from seed-demo-accounts ─────────────────────────── */
const U = {
  amina:    '3078ef1f-65ca-4517-bc62-8f12373b8c50',
  omar:     'ec365f68-76c2-4d28-a8a6-50473759cb09',
  freshmart:'f55d73d4-a4c1-4960-bde1-7475838626fb',
  techzone: '4e05df6e-27db-4821-a201-f25734b9d980',
  homestyle:'ced00dea-f2cc-4730-92be-2ba6ec03bfec',
  harvest:  '74ad6b94-208a-44da-852c-5e9572c53ac5',
  gadget:   '0495765a-3f52-4d3b-bbf5-7369ab468a32',
  fashion:  'c4758c90-9d2a-4b82-8da3-4592eda01b50',
  khalid:   'a79d990f-971e-442c-97fa-29984df12e46',
  safia:    '61b9de79-4ce8-4108-a1ab-d7620ae04a6c',
};

/* ── Helpers ─────────────────────────────────────────────────────── */
const post = (path, body) => fetch(`${API}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

async function placeOrder({ userId, customerName, customerPhone, items, paymentMethod, status = 'completed' }) {
  const r = await post('/api/orders', { userId, customerName, customerPhone, items, paymentMethod, status });
  const body = await r.json();
  if (!r.ok) throw new Error(`Order failed (${r.status}): ${JSON.stringify(body)}`);
  return body;
}

async function writeReview({ productId, userId, rating, comment, userName, userAvatar }) {
  const r = await post('/api/reviews', { productId, userId, rating, comment, userName, userAvatar });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Review failed (${r.status}): ${body}`);
  }
  return r.json();
}

async function getOrCreateConv(userId1, userId2) {
  const [u1, u2] = [userId1, userId2].sort();
  const { data: existing } = await admin.from('conversations')
    .select('id').eq('user_id_1', u1).eq('user_id_2', u2).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.from('conversations')
    .insert({ user_id_1: u1, user_id_2: u2 }).select('id').single();
  if (error) throw new Error(`Create conv: ${error.message}`);
  return data.id;
}

async function sendMsg(convId, senderId, content) {
  const { data, error } = await admin.from('messages')
    .insert({ conversation_id: convId, sender_id: senderId, content, message_type: 'text' })
    .select().single();
  if (error) throw new Error(`Send msg: ${error.message}`);
  // bump conversation updated_at
  await admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
  return data;
}

/* ── Fetch all products & index by partial name match ────────────── */
console.log('\n🔍  Fetching product catalog…');
const prodRes = await fetch(`${API}/api/products`);
const allProducts = await prodRes.json();

function findProd(partialName) {
  const p = allProducts.find(x => x.name.toLowerCase().includes(partialName.toLowerCase()));
  if (!p) throw new Error(`Product not found: "${partialName}"`);
  return p;
}

// Map products we care about
const P = {
  // FreshMart food
  bananas:    findProd('Organic Bananas'),
  oj:         findProd('Fresh Orange Juice'),
  bread:      findProd('Whole Grain Bread'),
  yogurt:     findProd('Greek Yogurt'),
  // TechZone electronics
  samsung:    findProd('Samsung Galaxy'),
  macbook:    findProd('MacBook Air'),
  airpods:    findProd('AirPods Pro'),
  dell:       findProd('Dell 27'),
  // HomeStyle
  lamp:       findProd('Minimalist Desk Lamp'),
  chair:      findProd('Ergonomic Office Chair'),
  bamboo:     findProd('Bamboo Cutting Board'),
  // Golden Harvest B2B
  rice:       findProd('Basmati Rice'),
  oil:        findProd('Sunflower Cooking Oil'),
  // Gadget World B2B
  cables:     findProd('USB-C Cables'),
  earbuds:    findProd('Wireless Earbuds'),
};

console.log(`  Found ${Object.keys(P).length} key products ✓`);

/* ════════════════════════════════════════════════════════════════════
   ORDERS
═══════════════════════════════════════════════════════════════════ */
console.log('\n📦  Placing orders…');

const orders = [
  /* Amina — consumer, 3 orders */
  { userId: U.amina, customerName: 'Amina Hassan', customerPhone: '+252611001001',
    items: [{ id: P.bananas.id, qty: 2 }, { id: P.oj.id, qty: 1 }],
    paymentMethod: 'waafi', status: 'completed' },
  { userId: U.amina, customerName: 'Amina Hassan', customerPhone: '+252611001001',
    items: [{ id: P.airpods.id, qty: 1 }],
    paymentMethod: 'card', status: 'completed' },
  { userId: U.amina, customerName: 'Amina Hassan', customerPhone: '+252611001001',
    items: [{ id: P.lamp.id, qty: 1 }],
    paymentMethod: 'cash', status: 'shipped' },

  /* Omar — consumer, 3 orders */
  { userId: U.omar, customerName: 'Omar Farah', customerPhone: '+252611002002',
    items: [{ id: P.macbook.id, qty: 1 }],
    paymentMethod: 'card', status: 'completed' },
  { userId: U.omar, customerName: 'Omar Farah', customerPhone: '+252611002002',
    items: [{ id: P.bread.id, qty: 2 }, { id: P.yogurt.id, qty: 1 }],
    paymentMethod: 'waafi', status: 'completed' },
  { userId: U.omar, customerName: 'Omar Farah', customerPhone: '+252611002002',
    items: [{ id: P.chair.id, qty: 1 }],
    paymentMethod: 'cash', status: 'processing' },

  /* Khalid (agent) — 2 orders */
  { userId: U.khalid, customerName: 'Khalid Mohamed', customerPhone: '+252615003003',
    items: [{ id: P.samsung.id, qty: 1 }],
    paymentMethod: 'waafi', status: 'completed' },
  { userId: U.khalid, customerName: 'Khalid Mohamed', customerPhone: '+252615003003',
    items: [{ id: P.bamboo.id, qty: 1 }],
    paymentMethod: 'cash', status: 'completed' },

  /* Safia (agent) — 2 orders */
  { userId: U.safia, customerName: 'Safia Warsame', customerPhone: '+252615004004',
    items: [{ id: P.dell.id, qty: 1 }],
    paymentMethod: 'card', status: 'completed' },
  { userId: U.safia, customerName: 'Safia Warsame', customerPhone: '+252615004004',
    items: [{ id: P.airpods.id, qty: 1 }, { id: P.bananas.id, qty: 3 }],
    paymentMethod: 'waafi', status: 'completed' },

  /* FreshMart (business) buys B2B from Golden Harvest */
  { userId: U.freshmart, customerName: 'FreshMart Grocery', customerPhone: '+252611005005',
    items: [{ id: P.rice.id, qty: 5 }, { id: P.oil.id, qty: 10 }],
    paymentMethod: 'waafi', status: 'completed' },
  { userId: U.freshmart, customerName: 'FreshMart Grocery', customerPhone: '+252611005005',
    items: [{ id: P.rice.id, qty: 3 }],
    paymentMethod: 'cash', status: 'processing' },

  /* TechZone (business) buys B2B from Gadget World */
  { userId: U.techzone, customerName: 'TechZone Electronics', customerPhone: '+252611006006',
    items: [{ id: P.cables.id, qty: 2 }, { id: P.earbuds.id, qty: 1 }],
    paymentMethod: 'card', status: 'completed' },
  { userId: U.techzone, customerName: 'TechZone Electronics', customerPhone: '+252611006006',
    items: [{ id: P.cables.id, qty: 4 }],
    paymentMethod: 'waafi', status: 'shipped' },
];

let orderOk = 0, orderFail = 0;
for (const o of orders) {
  try {
    const res = await placeOrder(o);
    console.log(`  ✅  Order ${res.id}  ${o.customerName}  $${res.total}  [${res.status}]`);
    orderOk++;
  } catch (e) {
    console.log(`  ❌  Order failed for ${o.customerName}: ${e.message}`);
    orderFail++;
  }
}

/* ════════════════════════════════════════════════════════════════════
   REVIEWS
═══════════════════════════════════════════════════════════════════ */
console.log('\n⭐  Writing reviews…');

const reviews = [
  // Amina reviews
  { productId: P.bananas.id, userId: U.amina, rating: 5, comment: 'So fresh and sweet! Perfect ripeness. Will order every week.', userName: 'Amina Hassan', userAvatar: '👩' },
  { productId: P.airpods.id, userId: U.amina, rating: 4, comment: 'Great sound quality and the noise cancellation is impressive. Fit perfectly.', userName: 'Amina Hassan', userAvatar: '👩' },
  { productId: P.lamp.id,    userId: U.amina, rating: 5, comment: 'Love the clean minimalist design. The USB charging port is a bonus!', userName: 'Amina Hassan', userAvatar: '👩' },

  // Omar reviews
  { productId: P.macbook.id, userId: U.omar, rating: 5, comment: 'Incredibly fast with the M3 chip. Battery easily lasts a full day. Best laptop I\'ve owned.', userName: 'Omar Farah', userAvatar: '👨' },
  { productId: P.yogurt.id,  userId: U.omar, rating: 4, comment: 'Very creamy and thick, exactly how Greek yogurt should be. Great for breakfast.', userName: 'Omar Farah', userAvatar: '👨' },
  { productId: P.chair.id,   userId: U.omar, rating: 4, comment: 'Extremely comfortable for long work sessions. Lumbar support is excellent. Worth every cent.', userName: 'Omar Farah', userAvatar: '👨' },

  // Khalid reviews
  { productId: P.samsung.id, userId: U.khalid, rating: 5, comment: 'The camera quality is absolutely insane. Best phone on the market right now!', userName: 'Khalid Mohamed', userAvatar: '🧑' },
  { productId: P.bamboo.id,  userId: U.khalid, rating: 3, comment: 'Good quality bamboo, eco-friendly. The medium board is slightly small for my needs.', userName: 'Khalid Mohamed', userAvatar: '🧑' },

  // Safia reviews
  { productId: P.dell.id,    userId: U.safia, rating: 5, comment: 'Crystal clear 4K display. The USB-C power delivery saved my desk from cable clutter. Highly recommend!', userName: 'Safia Warsame', userAvatar: '👩' },
  { productId: P.airpods.id, userId: U.safia, rating: 5, comment: 'These are just perfect. The transparency mode is super useful outdoors.', userName: 'Safia Warsame', userAvatar: '👩' },
];

let revOk = 0, revFail = 0;
for (const rv of reviews) {
  try {
    await writeReview(rv);
    console.log(`  ✅  Review: ${rv.userName} → "${rv.comment.slice(0, 50)}…"  [${rv.rating}★]`);
    revOk++;
  } catch (e) {
    console.log(`  ❌  Review failed: ${e.message}`);
    revFail++;
  }
}

/* ════════════════════════════════════════════════════════════════════
   CONVERSATIONS + MESSAGES
═══════════════════════════════════════════════════════════════════ */
console.log('\n💬  Creating conversations and messages…');

const convos = [
  /* 1. Amina ↔ FreshMart */
  {
    label: 'Amina ↔ FreshMart',
    u1: U.amina, u2: U.freshmart,
    messages: [
      { from: U.amina,     text: 'Hi! Do you offer any deals on bulk fruit orders? I need to order weekly.' },
      { from: U.freshmart, text: 'Hello Amina! Yes, we give 10% off on orders over $30. What fruits are you looking for?' },
      { from: U.amina,     text: 'Mostly bananas and orange juice. Can you guarantee freshness?' },
      { from: U.freshmart, text: 'Absolutely! We get fresh stock every Tuesday and Friday. Your order will always be same-day picked.' },
      { from: U.amina,     text: 'That\'s great! I just placed an order. Thank you 😊' },
      { from: U.freshmart, text: 'Thank you Amina! We\'ll have it delivered within 2 hours. Enjoy!' },
    ],
  },

  /* 2. Omar ↔ TechZone */
  {
    label: 'Omar ↔ TechZone',
    u1: U.omar, u2: U.techzone,
    messages: [
      { from: U.omar,     text: 'Hello, does the MacBook Air M3 come with an international warranty?' },
      { from: U.techzone, text: 'Hi Omar! Yes, all Apple products include a 1-year manufacturer warranty. We also offer a 2-year extended plan.' },
      { from: U.omar,     text: 'Perfect. What\'s the delivery time if I order today?' },
      { from: U.techzone, text: 'Same-day delivery if ordered before 2pm, next morning otherwise. We\'ll also set it up for you free of charge.' },
      { from: U.omar,     text: 'Excellent! I\'ll go ahead and place the order now.' },
      { from: U.techzone, text: 'Great choice! You\'ll love it. Let us know if you need any accessories to go with it.' },
    ],
  },

  /* 3. FreshMart ↔ Golden Harvest (B2B) */
  {
    label: 'FreshMart ↔ Golden Harvest',
    u1: U.freshmart, u2: U.harvest,
    messages: [
      { from: U.freshmart, text: 'Hi Golden Harvest, we need 20 sacks of basmati rice for this month. Can you confirm current stock levels?' },
      { from: U.harvest,   text: 'Hello FreshMart! We have 800 sacks available. 20 is no problem. I can arrange delivery by Thursday.' },
      { from: U.freshmart, text: 'Perfect. Please include an official invoice and packing list with the shipment.' },
      { from: U.harvest,   text: 'Of course. I\'ll also add our certificate of quality for this batch. Payment on delivery as usual?' },
      { from: U.freshmart, text: 'Yes, Waafi transfer on delivery. Thank you!' },
      { from: U.harvest,   text: 'Confirmed! Shipment scheduled for Thursday 8am. Driver will call 30 mins before arrival.' },
    ],
  },

  /* 4. TechZone ↔ Gadget World (B2B) */
  {
    label: 'TechZone ↔ Gadget World',
    u1: U.techzone, u2: U.gadget,
    messages: [
      { from: U.techzone, text: 'Hi Gadget World, we need 100 USB-C cables for a promotion next week. What\'s your fastest lead time?' },
      { from: U.gadget,   text: 'Hi TechZone! That\'s 2 packs of 50. We can ship tomorrow morning, arrives same day.' },
      { from: U.techzone, text: 'Excellent. Can you include branded packaging for retail display?' },
      { from: U.gadget,   text: 'Yes, each cable comes in a retail-ready box. We\'ll arrange the 2 bulk packs for you right now.' },
      { from: U.techzone, text: 'Order confirmed. Please process it.' },
      { from: U.gadget,   text: 'Done! Invoice sent to your email. Driver dispatched tomorrow at 7am.' },
    ],
  },

  /* 5. Khalid ↔ HomeStyle */
  {
    label: 'Khalid ↔ HomeStyle',
    u1: U.khalid, u2: U.homestyle,
    messages: [
      { from: U.khalid,    text: 'Is the ergonomic office chair available in black colour?' },
      { from: U.homestyle, text: 'Hello Khalid! Yes, we have it in black, dark grey, and navy blue. All three are in stock right now.' },
      { from: U.khalid,    text: 'Great! Does it come assembled or do I need to put it together?' },
      { from: U.homestyle, text: 'It comes 90% assembled. You only need to attach the armrests and base — takes about 5 minutes with the included tool.' },
      { from: U.khalid,    text: 'Perfect. I\'ll order the black one. Thanks!' },
    ],
  },

  /* 6. Safia ↔ Fashion Forward */
  {
    label: 'Safia ↔ Fashion Forward',
    u1: U.safia, u2: U.fashion,
    messages: [
      { from: U.safia,   text: 'Hello, I\'m interested in your hijab scarves. Do you do custom colours for small orders?' },
      { from: U.fashion, text: 'Hi Safia! Custom colours are available for orders of 20+ pieces per colour. What shades are you looking for?' },
      { from: U.safia,   text: 'I need dusty rose, sage green, and ivory. About 20 each.' },
      { from: U.fashion, text: 'All three are available! That would be 60 pieces total. I can have samples ready in 3 days before production.' },
      { from: U.safia,   text: 'Samples would be great. Please send them to Mogadishu, Hodan district.' },
      { from: U.fashion, text: 'Noted! Samples dispatched within 24 hours. We\'ll call to confirm the address.' },
    ],
  },
];

let msgOk = 0, msgFail = 0;
for (const convo of convos) {
  try {
    const convId = await getOrCreateConv(convo.u1, convo.u2);
    for (const m of convo.messages) {
      await sendMsg(convId, m.from, m.text);
      msgOk++;
    }
    console.log(`  ✅  ${convo.label.padEnd(30)} → ${convo.messages.length} messages (conv ${convId})`);
  } catch (e) {
    console.log(`  ❌  ${convo.label}: ${e.message}`);
    msgFail++;
  }
}

/* ── Summary ─────────────────────────────────────────────────────── */
console.log('\n══════════════════════════════════════════════════════');
console.log('  ACTIVITY SEED COMPLETE');
console.log('══════════════════════════════════════════════════════');
console.log(`  Orders:   ${orderOk} placed,  ${orderFail} failed`);
console.log(`  Reviews:  ${revOk} written, ${revFail} failed`);
console.log(`  Messages: ${msgOk} sent,    ${msgFail} failed`);
console.log('\n  What each account now has:');
console.log('  demo.customer1@gmail.com   3 orders | 3 reviews | chat with FreshMart');
console.log('  demo.customer2@gmail.com   3 orders | 3 reviews | chat with TechZone');
console.log('  demo.freshmart@gmail.com   2 B2B orders | chat with Golden Harvest + customer');
console.log('  demo.techzone@gmail.com    2 B2B orders | chat with Gadget World + customer');
console.log('  demo.homestyle@gmail.com   no orders | chat with Khalid');
console.log('  demo.harvest@gmail.com     products reviewed by buyers | B2B chat');
console.log('  demo.gadgetwh@gmail.com    products reviewed | B2B chat');
console.log('  demo.fashionf@gmail.com    chat with Safia');
console.log('  demo.agent1@gmail.com      2 orders | 2 reviews');
console.log('  demo.agent2@gmail.com      2 orders | 2 reviews | chat with Fashion Forward');
console.log('══════════════════════════════════════════════════════\n');
