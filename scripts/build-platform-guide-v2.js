/* Builds Mogarenta-Platform-Guide-v2.docx from the actual codebase state (v3.7).
   Run:  node scripts/build-platform-guide-v2.js
   Does NOT touch the existing Mogarenta-Platform-Guide.docx. */

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, TableOfContents, LevelFormat, PositionalTab,
  PositionalTabAlignment, PositionalTabLeader,
} = require('docx');

const BRAND = '2E7D5B';       // Mogarenta green
const INK = '1A2E28';
const MUTED = '5B6B64';
const LIGHT = 'EAF3EE';
const RULE = 'C9D8D0';

/* ---------- helpers ---------- */
const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 140 },
  border: { bottom: { color: BRAND, style: BorderStyle.SINGLE, size: 8, space: 6 } },
  children: [new TextRun({ text, bold: true, size: 30, color: BRAND, font: 'Calibri' })],
});

const H2 = (text, emoji) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 80 },
  children: [new TextRun({ text: (emoji ? emoji + '  ' : '') + text, bold: true, size: 24, color: INK, font: 'Calibri' })],
});

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 160, after: 60 },
  children: [new TextRun({ text, bold: true, size: 21, color: BRAND, font: 'Calibri' })],
});

const P = (runs, opts = {}) => new Paragraph({
  spacing: { after: 120, line: 276 },
  children: (Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: INK, font: 'Calibri' })]),
  ...opts,
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { after: 40, line: 264 },
  children: Array.isArray(text) ? text : [new TextRun({ text, size: 21, color: INK, font: 'Calibri' })],
});

const num = (text, level = 0) => new Paragraph({
  numbering: { reference: 'steps', level },
  spacing: { after: 40, line: 264 },
  children: Array.isArray(text) ? text : [new TextRun({ text, size: 21, color: INK, font: 'Calibri' })],
});

const code = (t) => new TextRun({ text: t, font: 'Consolas', size: 19, color: BRAND });
const b = (t) => new TextRun({ text: t, bold: true, size: 21, color: INK, font: 'Calibri' });
const t = (txt) => new TextRun({ text: txt, size: 21, color: INK, font: 'Calibri' });

/* two-column reference table (route/label + description) */
function refTable(rows, col0 = 3200, col1 = 6100) {
  return new Table({
    width: { size: col0 + col1, type: WidthType.DXA },
    columnWidths: [col0, col1],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map((r, i) => new TableRow({
      children: [
        new TableCell({
          width: { size: col0, type: WidthType.DXA },
          shading: i === 0 ? { type: ShadingType.CLEAR, fill: BRAND } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [
            i === 0
              ? new TextRun({ text: r[0], bold: true, color: 'FFFFFF', size: 20, font: 'Calibri' })
              : new TextRun({ text: r[0], font: r[2] ? 'Consolas' : 'Calibri', size: 19, color: r[2] ? BRAND : INK, bold: !r[2] }),
          ] })],
        }),
        new TableCell({
          width: { size: col1, type: WidthType.DXA },
          shading: i === 0 ? { type: ShadingType.CLEAR, fill: BRAND } : (i % 2 === 0 ? { type: ShadingType.CLEAR, fill: LIGHT } : undefined),
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [
            new TextRun({ text: r[1], bold: i === 0, color: i === 0 ? 'FFFFFF' : INK, size: i === 0 ? 20 : 20, font: 'Calibri' }),
          ] })],
        }),
      ],
    })),
  });
}

/* ---------- content ---------- */
const children = [];

/* Cover */
children.push(
  new Paragraph({ spacing: { before: 2600 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '🏪', size: 96 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
    children: [new TextRun({ text: 'Mogarenta', bold: true, size: 72, color: BRAND, font: 'Calibri' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 },
    children: [new TextRun({ text: 'Platform Guide & Functional Reference', size: 30, color: INK, font: 'Calibri' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 },
    children: [new TextRun({ text: 'A local marketplace + Point-of-Sale platform for Somalia & East Africa', italics: true, size: 21, color: MUTED, font: 'Calibri' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 },
    children: [new TextRun({ text: 'Version 2.0  •  July 2026  •  Rebuilt from source (schema v3.7)', size: 20, color: MUTED, font: 'Calibri' })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

/* TOC */
children.push(
  H1('Table of Contents'),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
);

/* 1. Platform Overview */
children.push(H1('1.  Platform Overview'));
children.push(P([
  b('Mogarenta'), t(' is a multi-sided marketplace and business-management platform built for Somalia and East Africa. It connects three audiences: '),
  b('customers'), t(' who shop for products, '), b('businesses and suppliers'), t(' who sell and run their store operations, and a platform '),
  b('administration team'), t(' that oversees everything. A fourth role, the '), b('field agent'), t(', registers and supports stores on the ground for commission.'),
]));
children.push(P([
  t('The application is a '), b('Single-Page Application (SPA)'), t(' built on '), b('Next.js 16 (App Router)'),
  t(' with a hash-based router ('), code('/#/'), t('). All navigation is client-side — '), code('app/[[...slug]]/page.tsx'),
  t(' is the only real page route, and every screen is a lazy-loaded view under '), code('views/'), t('. '),
  b('Supabase (Postgres)'), t(' provides the database and authentication.'),
]));
children.push(H3('The claim model'));
children.push(P([
  t('Products live in a shared global catalog. A store does not create isolated products — it '), b('claims'),
  t(' catalog products into its own storefront (setting its own price and stock). This is why the same product can appear across many stores, each with its own offer. Businesses can also add brand-new catalog products.'),
]));
children.push(H3('Key capabilities at a glance'));
[
  ['Marketplace browsing', 'customers explore products, storefronts, and nearby offers'],
  ['Per-shop cart & checkout', 'cart grouped by store; each store checked out separately with pickup or delivery'],
  ['Sifalo Pay checkout', 'Somali mobile-wallet payments (EVC / ZAAD / SAHAL, eDahab, Premier)'],
  ['Order tracking', 'real-time status from pending → completed, with QR pickup'],
  ['Business tools', 'inventory, POS, cashier staff, revenue dashboard, payouts wallet'],
  ['Customer ledger', 'per-store customer records, credit invoices, and order attribution'],
  ['Realtime + push', 'instant no-refresh updates and Web Push for orders and chat'],
  ['AI features', 'Somali product-description writer and a public help assistant'],
  ['Field-agent programme', 'agents register stores and earn tiered commission'],
  ['Admin panel', 'full oversight — approvals, catalog, orders, users, team, storefront banner'],
].forEach(([k, v]) => children.push(bullet([b(k + ' — '), t(v)])));

/* 2. Architecture & Tech Stack */
children.push(H1('2.  Architecture & Tech Stack'));
children.push(refTable([
  ['Layer', 'Technology'],
  ['Frontend', 'Next.js 16 (App Router), React 18, TypeScript'],
  ['Routing', 'Hash-routed SPA — lib/hashRouter, one catch-all page route'],
  ['Backend', 'Next.js Route Handlers under app/api/** on the Supabase service-role client'],
  ['Database', 'Supabase Postgres — canonical schema supabase/schema_v3.sql + migration_v3_*.sql'],
  ['Auth', 'Supabase Auth (email/password + Google OAuth); cashiers use PINs, not Supabase accounts'],
  ['Payments', 'Sifalo Pay (lib/payments/sifalo) — Somali mobile wallets'],
  ['AI', 'lib/ai — provider-agnostic (OpenRouter preferred, Gemini fallback)'],
  ['Realtime', 'Supabase broadcast pings (server → client) + Web Push (web-push / VAPID)'],
], 2400, 6900));
children.push(P([]));
children.push(P([
  b('Security model. '), t('There is no global middleware. Every '), code('app/api/**'),
  t(' handler runs with the service-role key (bypassing Row-Level Security), so '),
  b('each route enforces its own authorization'), t(' via '), code('lib/apiAuth'),
  t(' — JWT bearer → '), code('getAuthUser'), t(', '), code('requireStaff'), t(', '), code('requireAdmin'),
  t(', and ownership checks ('), code('ownsStoreOrAdmin'), t(', '), code('requireProductOwner'), t(', '), code('requireClaimOwner'),
  t('). Public POST endpoints (orders, AI, payments, cashier login) are IP rate-limited via '), code('lib/rateLimit'), t('.'),
]));

/* 3. User Types & Roles */
children.push(H1('3.  User Types & Roles'));
const roles = [
  ['Guest (not logged in)', 'A visitor without an account. Can browse the catalog, storefronts, and nearby offers, but cannot buy, chat, or manage anything.'],
  ['Customer', 'A shopper with a personal account (account type user). Shops, tracks orders, manages addresses, saves wishlists, and chats with sellers.'],
  ['Business', 'A retail seller (account type business). Manages claimed/owned products, processes orders through a POS terminal, manages cashier staff, keeps a customer ledger, and views revenue and payouts. New business accounts start pending until an admin approves them.'],
  ['Supplier', 'A wholesale seller (account type supplier). Operates like a business but caters to bulk/wholesale orders (minimum order amounts, delivery-day estimates). Also goes through admin approval.'],
  ['Field Agent', 'An on-the-ground representative (account type agent). Registers new stores, supports them, and earns tiered commission. Their profile shows registrations, stores reached, and commission/tier progress.'],
  ['Admin', 'A platform administrator. Full access to all data — approve/reject businesses, manage the catalog, oversee all orders and users, edit the storefront hero banner, and manage the admin team.'],
  ['Semi-Admin (Viewer)', 'A read-only administrator. Sees the same data as an admin but cannot modify anything.'],
  ['Cashier (Staff)', 'A staff member assigned to a business. Logs in with a PIN (not a Supabase account) and is limited by privilege flags set by the owner (e.g. pos, inventory, customers, reports).'],
];
roles.forEach(([r, d]) => { children.push(H3(r)); children.push(P(d)); });

/* 4. Pages */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1('4.  Pages — Detailed Functionality'));

function page(emoji, title, route, intro, feats) {
  children.push(H2(title, emoji));
  children.push(new Paragraph({ spacing: { after: 80 }, children: [code(route)] }));
  children.push(P(intro));
  feats.forEach(f => children.push(bullet(f)));
}

page('🏠', 'Explore (Home)', '/', 'The main landing page. Displays the product catalog in a grid, organized by category and subcategory. Visitors browse freely without logging in.', [
  'Category filter bar and subcategory chips to narrow the grid',
  'Product cards — image, name, price, rating, stock badge, store label',
  'Editable "Explore Hot Deals" hero banner (image + copy set by admins)',
  'Per-shop cart drawer that persists across navigation',
  'Verified checkmark on cards from approved sellers; 🌐 label on online-only stores',
  'Incremental loading — grid pages in 24 at a time for performance',
]);
page('🔍', 'Search', '/#/search', 'Full-text product search plus a stores section. Results update as the user types.', [
  'Instant, debounced search — matches product name and description',
  '🏪 Stores section surfaces matching storefronts alongside products',
  'Nearby-offers ranking uses live GPS to show the closest stores carrying an item',
  'Add to cart directly from results; empty-state prompt when nothing matches',
]);
page('📦', 'Product Detail', '/#/product/:id  (also /#/:slug/:productId)', 'Full detail page for a single product, including seller info, reviews, and similar products.', [
  'Image gallery, name, price, rating, category; stock indicator',
  'Quantity selector capped at available stock; add-to-cart',
  'Seller card linking to the storefront',
  'Reviews — average rating + individual reviews; ordered customers can leave one',
  'Similar-products grid (shared tags > name words > subcategory > category)',
  'AI-generated Somali product description when enabled',
  'Self-purchase guard — sellers cannot buy their own products',
]);
page('🏪', 'Supplier / Business Storefront', '/#/:slug  or  /#/supplier/:id', 'Public storefront for a store. Every store has a unique slug (e.g. /#/city-care-pharmacy).', [
  'Seller banner — name, logo/emoji, location, bio, categories, contact numbers',
  'Verified badge (blue check) for approved sellers; 🌐 for online-only',
  'Product grid filtered to that store; star rating and review count',
  'Minimum order amount and delivery-days estimate (suppliers)',
  '"Message" button to open a chat (requires login); wishlist buttons on cards',
]);
page('🏭', 'Suppliers List', '/#/suppliers', 'A directory of all suppliers. Browse and filter wholesale sellers.', [
  'Grid of supplier cards with rating, location, and category tags',
  'Filter by category, location, and minimum-order range; sort by rating/reviews/min order',
  'Tap a card to open the storefront',
]);
page('🛒', 'Checkout (per-shop)', '/#/checkout  and  /#/checkout/:shopId', 'The cart is grouped by store, and each store is checked out separately. Requires login.', [
  'Order summary scoped to one store; subtotal, discount, and total',
  'Coupon code field — validated against active coupons',
  'Pickup or delivery toggle; delivery shows a Mogadishu district dropdown',
  'Online-only stores are delivery-only (no pickup, no map)',
  'Sifalo Pay — charged on-page via EVC/ZAAD/SAHAL, eDahab, or Premier',
  'Place Order creates the order server-side (prices computed on the server) and clears that store\'s cart',
]);
page('💳', 'Sifalo Payment Return', '/#/payment/sifalo/return', 'Landing screen after a Sifalo Pay transaction resolves; verifies and reflects payment status back into the order.', [
  'Verifies the payment via /api/payments/sifalo/verify',
  'Shows success/failure and links back to order tracking',
]);
page('📋', 'Orders & Order Tracking', '/#/orders  and  /#/orders/:id', 'Lists orders placed by the customer or received by the store. Each opens to full detail and tracking.', [
  'Status badges — pending, processing, completed, cancelled (forward-only progression)',
  'Order detail — item list, QR code for pickup, seller info, timeline',
  'Businesses scan a customer QR to confirm pickup',
  'PII masking on order pages; all /api/orders reads require auth headers',
  'Business view shows all orders received; admin view spans the whole platform',
]);
page('👤', 'Profile', '/#/profile', 'Personal profile for the logged-in user, and the hub for store/agent account info.', [
  'Display name, avatar emoji, email, editable phone; account-type badge',
  'Store slug / link management with availability check (business/supplier)',
  'Approval status + "Request approval" button; verification-document submission',
  'Visibility Settings — including the online-only (🌐) store toggle',
  'Saved addresses (add/edit/delete); referral code; sign out',
  'Field agents see registrations, stores reached, and commission/tier panel',
]);
page('💬', 'Chat', '/#/chat  and  /#/chat/:id', 'Real-time 1-on-1 messaging between customers and stores.', [
  'Conversation list sorted by most recent, with unread badges',
  'Message bubbles with timestamps; instant delivery via realtime pings',
  'Web Push notification on new message when the app is backgrounded',
  'Stores see every conversation they are part of',
]);
page('🔔', 'Notifications', '/#/notifications', 'In-app notification center for order changes, messages, approvals, and announcements.', [
  'Newest-first list with read/unread state; tap to mark read; mark-all-as-read',
  'Type icons (order, chat, system); updates instantly via realtime',
  'Push subscription managed here (VAPID Web Push)',
]);
page('⚙️', 'Settings', '/#/settings', 'Display preferences and account-level options.', [
  'Dark / light theme toggle; language selection (i18n)',
  'Notification / push preferences',
  'Business/supplier: receipt settings and hide-stock-levels toggle',
]);
page('📊', 'Business Dashboard', '/#/my-dashboard', 'Per-store analytics and revenue overview for business and supplier accounts (scoped to the signed-in store).', [
  'Total revenue — all-time, this month, today; monthly order count',
  'Revenue trend sparkline; recent orders; top-selling products; category breakdown',
  'Low-stock alert cards',
  'Online Payments Wallet — server-computed Sifalo balance, saved payout number, and a payouts ledger with exact-amount deductions',
]);
page('📦', 'Inventory', '/#/inventory', 'Product inventory management for a store — add, edit, restock, and remove listings.', [
  'Product list with stock, price, category',
  'Add product — with AI Somali description generator and image upload',
  'Claim a global catalog product into your store (one-click "Add to Store")',
  'Adjust stock (+/− or exact); barcode scanner to look up/add items',
  'Ownership-guarded edit/delete/restock (claimed vs owned handled separately)',
  'Low-stock badges; bulk price update',
]);
page('👥', 'Customers', '/#/customers', 'The store\'s own customer ledger — everyone who has ordered from this store.', [
  'Per-store customer records with name, contact, total spend, order count',
  'Credit-invoice ledger — issue and track invoices/credit per customer',
  'Search by name or phone; view a customer\'s order history; export list',
]);
page('🖨️', 'Point of Sale (POS)', '/#/pos', 'An in-store sales terminal for face-to-face transactions, used by owners and authorized cashiers.', [
  'Product search / barcode scan; cart panel with quantities',
  'Link the sale to a known customer; apply coupon/discount',
  'Cash or card mode; cash-tendered and change calculation',
  'Credit-invoice sales recorded to the customer ledger',
  'Printable receipt with store logo and QR code; parked carts (save/resume)',
  'POS session — open/close the cash drawer with a server-computed Z-report',
  'Cashier PIN gate before use',
]);
page('🪪', 'Staff Management', '/#/staff', 'Create and manage cashier/staff accounts, each with a PIN and privilege flags.', [
  'Cashier list — name, masked PIN, status, privileges',
  'Add/edit cashier — name, PIN, and privilege flags (pos, inventory, customers, reports)',
  'Deactivate/delete; active-session indicator showing who is logged in to POS',
]);
page('🔑', 'Cashier Login', '/#/cashier-login', 'PIN-based login for staff — does not use Supabase auth.', [
  'Business lookup → choose cashier name → 4-digit PIN pad',
  'Local session (no password reset); auto-redirect to POS; logout from POS',
]);
page('🛡️', 'Admin Panel', '/#/admin', 'Platform administration dashboard, gated by the admins table via /api/admin/check.', [
  'Overview — key stats (businesses, products, orders, users, pending verifications) and recent orders',
  'Businesses — approve/reject pending accounts, edit details, toggle verified badge',
  'Products — full catalog CRUD; assign to a store',
  'Orders — all platform orders; filter and update any status',
  'Users — all registered accounts',
  'Team — add admins; assign admin or semi-admin (viewer); remove admins',
  'Storefront — edit the Explore hero banner image and copy',
]);
page('❤️', 'Wishlist', '/#/wishlist', 'Saved products for the logged-in customer, synced across devices.', [
  'Add/remove from product cards and detail pages; server-synced',
  'Quick add-to-cart from the wishlist',
]);
page('📄', 'Legal', '/#/privacy  and  /#/terms', 'Static privacy-policy and terms-of-service pages.', [
  'Rendered by a shared LegalView',
]);
page('✏️', 'Sign Up', '/#/auth/signup', 'Account creation. Users choose an account type first, then sign up with email/password or Google.', [
  'Choose account type: Customer, Business, Supplier (agents are provisioned separately)',
  'Email flow — email + password (min 6 chars, confirm); or Google OAuth → /auth/callback',
  'A profile/supplier record is created automatically; a store slug is auto-generated',
  'Business/supplier registrations start with pending approval status',
]);
page('🔐', 'Sign In', '/#/auth/login', 'Login for registered users — email/password and Google OAuth.', [
  'Email/password with show/hide toggle; Google one-tap',
  'Forgot-password link (Supabase reset email); redirect to profile on success',
]);

/* 5. Key Workflows */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1('5.  Key Workflows'));

function flow(title, steps) {
  children.push(H3(title));
  steps.forEach(s => children.push(num(s)));
}

flow('Customer Purchase Flow (per-shop)', [
  'Browse Explore/Search → add items to the cart (grouped by store)',
  'Open the cart drawer → review a store\'s items → Checkout that store',
  'Log in if needed (redirect back to checkout)',
  'Apply a coupon (optional); choose pickup or delivery + Mogadishu district',
  'Pay with Sifalo (EVC/ZAAD/SAHAL, eDahab, Premier) on-page',
  'Order is created server-side with status "pending"; that store\'s cart clears',
  'Track the order at /#/orders/:id — the seller advances the status',
]);
flow('Business Onboarding & Approval', [
  'Register → choose "Business" → account created with approval_status = pending',
  'Admin sees it under Admin → Businesses with a "wants approval" badge',
  'Admin clicks Approve → approval_status = approved',
  'Business gains full access — dashboard, POS, inventory, customers, payouts',
  'Business optionally submits a verification request for the verified badge',
]);
flow('POS Sale', [
  'Cashier → /#/cashier-login → select business and cashier → enter PIN',
  'Redirected to POS → search/scan a product → add to cart',
  'Optionally link a customer, apply a coupon, or park the cart',
  'Choose cash or card (or record a credit invoice) → enter amount tendered',
  'Complete Sale → order created → receipt with store logo + QR generated',
]);
flow('Cashier Session (Z-Report)', [
  'Owner opens a POS session at the start of the day (opening float)',
  'Each cashier sale is linked to the session',
  'At end of day the owner closes the session → Z-report computed server-side',
  'Report shows expected cash, actual cash, and discrepancy',
]);
flow('Customer Ledger & Credit Invoices', [
  'A store\'s orders and POS sales attribute the customer per-store',
  'The store issues credit invoices from Customers/POS into a per-store ledger',
  'The ledger tracks spend, outstanding credit, and order history per customer',
]);
flow('Payouts (Online Payments Wallet)', [
  'Sifalo-paid orders accrue a server-computed balance on the store dashboard',
  'The store saves a payout number',
  'A payout request deducts the exact amount and is recorded in the payouts ledger',
]);
flow('Field-Agent Commission', [
  'An agent registers new stores on the ground',
  'The agent profile shows registrations, stores reached, and commission/tier',
  'Commission accrues per lib/agentCommission tiers as stores activate',
]);
flow('Business Verification', [
  'Business submits a verification request from /#/profile',
  'Admin sees the pending-verifications count on the Overview tab',
  'Admin approves → verified = true → verified badge appears on the storefront and cards',
]);

/* 6. API Overview */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1('6.  API Overview'));
children.push(P([
  t('All API routes live under '), code('/api/'), t('. Each handler uses the Supabase '), b('service-role'),
  t(' key (bypassing Row-Level Security), so authorization is enforced '), b('per route'), t(' in '), code('lib/apiAuth'),
  t(' — not by the database. All responses are JSON. Read endpoints that expose per-user or per-store data check ownership; mutations gate on staff/admin. Many GETs support ETag conditional requests to cut polling bandwidth.'),
]));

const apiGroups = [
  ['Catalog & storefronts', [
    'products, products/[id] — global catalog',
    'business-products, business-products/[id] — claim-model store offers',
    'inventory, inventory/[id] — stock management',
    'suppliers, suppliers/[id], suppliers/[id]/request-approval',
    'profile, profile/[id] — account + store profile',
    'search/offers — nearby offers with GPS distance ranking',
  ]],
  ['Commerce', [
    'orders, orders/[id] — server-authoritative orders (auth required)',
    'coupons, coupons/[id], coupons/validate',
    'reviews, reviews/[id]',
    'customers, customers/[id] — per-store customer ledger',
    'invoices, invoices/[id] — credit invoices',
    'addresses, addresses/[id]',
    'wishlist, wishlist/sync',
  ]],
  ['Payments', [
    'payments/sifalo/checkout — on-page charge',
    'payments/sifalo/initiate — start a transaction',
    'payments/sifalo/verify — confirm status',
    'payouts — store payout requests / ledger',
  ]],
  ['POS & staff', [
    'pos-sessions, pos-sessions/[id] — open/close + Z-report',
    'cashiers, cashiers/[id], cashiers/login — PIN auth',
  ]],
  ['Messaging & notifications', [
    'conversations, conversations/[id], conversations/[id]/messages',
    'notifications, notifications/[id]',
    'push/subscribe — Web Push (VAPID) subscription',
  ]],
  ['AI', [
    'ai/describe-product — Somali product-description writer',
    'ai/assistant — public help assistant chatbot',
  ]],
  ['Growth', [
    'referrals — referral codes',
    'agent/stats — field-agent registrations & commission',
  ]],
  ['Admin & platform', [
    'admin/check, admin/stats, admin/users',
    'admin/admins, admin/admins/[id] — team management',
    'verification-requests — business verification',
    'settings/hero — editable Explore hero banner',
    'health — service health check',
  ]],
];
apiGroups.forEach(([g, routes]) => {
  children.push(H3(g));
  routes.forEach(r => children.push(bullet([code(r)])));
});

children.push(new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '— End of Document —', italics: true, color: MUTED, size: 20, font: 'Calibri' })] }));

/* ---------- assemble ---------- */
const doc = new Document({
  creator: 'Mogarenta',
  title: 'Mogarenta Platform Guide v2.0',
  description: 'Platform guide rebuilt from source (schema v3.7)',
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 260 } }, run: { color: BRAND } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 920, hanging: 260 } } } },
      ]},
      { reference: 'steps', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 300 } }, run: { bold: true, color: BRAND } } },
      ]},
    ],
  },
  styles: {
    default: { document: { run: { font: 'Calibri', size: 21, color: INK } } },
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
    children,
  }],
});

const out = path.join(__dirname, '..', 'Mogarenta-Platform-Guide-v2.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf);
  console.log('Wrote', out, '(' + buf.length + ' bytes)');
});
