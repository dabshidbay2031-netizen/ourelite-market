/**
 * Generates Mogarenta-Platform-Guide.docx
 * Run: node scripts/generate-docs.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, Header, Footer, PageNumber,
  NumberFormat, convertInchesToTwip, TableLayoutType,
} from 'docx';
import { writeFileSync } from 'fs';

/* ── Palette ──────────────────────────────────────────────────── */
const PRIMARY   = '1E3A8A'; // deep blue
const ACCENT    = '3B82F6'; // bright blue
const MUTED     = '6B7280'; // gray
const GREEN     = '059669';
const AMBER     = 'D97706';
const RED       = 'DC2626';
const BG_LIGHT  = 'EFF6FF'; // pale blue for table headers
const BG_DARK   = '1E3A8A'; // header strip

/* ── Helpers ──────────────────────────────────────────────────── */
const noBorder = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const thinBorder = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
  left:   { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
  right:  { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
};

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 36, color: PRIMARY, font: 'Calibri' }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 80 },
    children: [
      new TextRun({ text, bold: true, size: 28, color: ACCENT, font: 'Calibri' }),
    ],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 60 },
    children: [
      new TextRun({ text, bold: true, size: 24, color: PRIMARY, font: 'Calibri' }),
    ],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text, size: 22, font: 'Calibri', color: '111827', ...opts }),
    ],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text, size: 22, font: 'Calibri', color: '111827' }),
    ],
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB' } },
    children: [],
  });
}

function spacer(lines = 1) {
  return new Paragraph({ spacing: { before: lines * 120, after: 0 }, children: [] });
}

function label(text, color = MUTED) {
  return new TextRun({ text, size: 18, color, font: 'Calibri', bold: true });
}

function pill(text, color = GREEN) {
  return new Paragraph({
    spacing: { before: 30, after: 30 },
    children: [
      new TextRun({ text: `[${text}]`, size: 18, bold: true, color, font: 'Calibri' }),
    ],
  });
}

/* ── Section header paragraph (coloured strip) ───────────────── */
function sectionStrip(text) {
  return new Paragraph({
    spacing: { before: 320, after: 120 },
    shading: { type: ShadingType.SOLID, color: BG_LIGHT },
    children: [
      new TextRun({ text: `  ${text}`, bold: true, size: 28, color: PRIMARY, font: 'Calibri' }),
    ],
  });
}

/* ── Feature table ───────────────────────────────────────────── */
function featureTable(rows) {
  // rows: [{ feature, guest, customer, business, supplier, admin, cashier }]
  const COLS = ['Feature / Action', 'Guest', 'Customer', 'Business', 'Supplier', 'Admin', 'Cashier'];
  const COL_W = [3500, 1100, 1200, 1200, 1200, 1100, 1200];

  const checkCell = (val, isHeader = false) => {
    const text = isHeader ? val : (val === true ? '✔' : val === false ? '—' : String(val ?? '—'));
    const color = isHeader ? 'FFFFFF' : (val === true ? GREEN : val === false ? 'D1D5DB' : '111827');
    const bold  = isHeader || val === true;
    return new TableCell({
      width: { size: COL_W[0], type: WidthType.DXA },
      shading: isHeader ? { type: ShadingType.SOLID, color: PRIMARY } : {},
      borders: thinBorder,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, size: 18, bold, color, font: 'Calibri' })],
        }),
      ],
    });
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: COLS.map((c, i) => {
      return new TableCell({
        width: { size: COL_W[i], type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: PRIMARY },
        borders: thinBorder,
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: c, size: 18, bold: true, color: 'FFFFFF', font: 'Calibri' })],
          }),
        ],
      });
    }),
  });

  const dataRows = rows.map((r, ri) => {
    const bg = ri % 2 === 0 ? 'FFFFFF' : 'F9FAFB';
    const vals = [r.feature, r.guest, r.customer, r.business, r.supplier, r.admin, r.cashier];
    return new TableRow({
      children: vals.map((v, i) => {
        const isFeature = i === 0;
        const text = isFeature ? String(v) : (v === true ? '✔' : v === false ? '—' : String(v ?? '—'));
        const color = isFeature ? '111827' : (v === true ? GREEN : v === false ? 'D1D5DB' : '111827');
        return new TableCell({
          width: { size: COL_W[i], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: bg },
          borders: thinBorder,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: isFeature ? AlignmentType.LEFT : AlignmentType.CENTER,
              children: [new TextRun({ text, size: isFeature ? 20 : 18, bold: isFeature, color, font: 'Calibri' })],
            }),
          ],
        });
      }),
    });
  });

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 10500, type: WidthType.DXA },
    rows: [headerRow, ...dataRows],
  });
}

/* ── Page definition ────────────────────────────────────────────────── */
function pageSection(title, route, icon, description, bullets, featureRows) {
  return [
    spacer(1),
    sectionStrip(`${icon}  ${title}   (${route})`),
    body(description),
    spacer(0.5),
    ...bullets.map(b => bullet(b)),
    spacer(0.5),
    featureTable(featureRows),
    divider(),
  ];
}

/* ══════════════════════════════════════════════════════════════════
   DOCUMENT CONTENT
══════════════════════════════════════════════════════════════════ */
const children = [

  /* ── Cover ── */
  spacer(4),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: '🏪', size: 96, font: 'Segoe UI Emoji' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text: 'Mogarenta', bold: true, size: 72, color: PRIMARY, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: 'Platform Guide & Functional Reference', size: 36, color: MUTED, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 0 },
    children: [new TextRun({ text: `Version 1.0  •  June 2026`, size: 22, color: MUTED, font: 'Calibri' })],
  }),
  spacer(8),

  /* ── TOC placeholder ── */
  new Paragraph({ pageBreakBefore: true, children: [] }),

  h1('Table of Contents'),
  body('1.  Platform Overview', { bold: true }),
  body('2.  User Types & Roles'),
  body('3.  Pages — Detailed Functionality'),
  body('    3.1  Explore (Home)                    /'),
  body('    3.2  Search                             /#/search'),
  body('    3.3  Product Detail                    /#/product/:id'),
  body('    3.4  Supplier Storefront               /#/:slug'),
  body('    3.5  Suppliers List                    /#/suppliers'),
  body('    3.6  Checkout                          /#/checkout'),
  body('    3.7  Orders & Order Tracking           /#/orders'),
  body('    3.8  Profile                           /#/profile'),
  body('    3.9  Chat                              /#/chat'),
  body('    3.10 Notifications                    /#/notifications'),
  body('    3.11 Settings                         /#/settings'),
  body('    3.12 Business Dashboard               /#/dashboard'),
  body('    3.13 Inventory                        /#/inventory'),
  body('    3.14 Customers                        /#/customers'),
  body('    3.15 Point of Sale (POS)              /#/pos'),
  body('    3.16 Staff                            /#/staff'),
  body('    3.17 Cashier Login                   /#/cashier-login'),
  body('    3.18 Admin Panel                     /#/admin'),
  body('    3.19 Sign Up                         /#/auth/signup'),
  body('    3.20 Sign In                         /#/auth/login'),
  body('4.  Key Workflows'),
  body('5.  API Overview'),

  /* ═══════════════════════════════════════════════════════════
     1. PLATFORM OVERVIEW
  ═══════════════════════════════════════════════════════════ */
  new Paragraph({ pageBreakBefore: true, children: [] }),
  h1('1. Platform Overview'),
  body(
    'Mogarenta is a multi-sided marketplace and business management platform. ' +
    'It connects customers who shop for products, businesses and suppliers who sell and manage inventory, ' +
    'and a platform administration team that oversees all activity.'
  ),
  spacer(0.5),
  body('The application is built as a Single-Page Application (SPA) using Next.js 16, Supabase for authentication and the database, and a hash-based routing system (/#/) that keeps all navigation client-side.'),
  spacer(0.5),
  body('Key capabilities at a glance:', { bold: true }),
  bullet('Marketplace browsing — customers explore products and supplier storefronts'),
  bullet('Cart & checkout — add items, apply coupons, place orders'),
  bullet('Order tracking — real-time status from pending → completed'),
  bullet('Business tools — inventory, POS, cashier management, revenue dashboard'),
  bullet('Supplier wholesale — bulk orders, approval-based access'),
  bullet('1-on-1 chat — customers message businesses/suppliers directly'),
  bullet('Admin panel — full platform oversight, business approval, team management'),
  bullet('Referral & loyalty — referral codes, notifications, wishlists'),

  /* ═══════════════════════════════════════════════════════════
     2. USER TYPES
  ═══════════════════════════════════════════════════════════ */
  new Paragraph({ pageBreakBefore: true, children: [] }),
  h1('2. User Types & Roles'),

  h2('Guest (not logged in)'),
  body('A visitor who has not created an account. They can browse the catalog and supplier storefronts but cannot buy, chat, or manage anything.'),

  h2('Customer'),
  body('A regular shopper with a personal account (account type: user). Customers shop, track orders, manage addresses, save wishlists, and chat with sellers.'),

  h2('Business'),
  body('A seller who operates a retail business on the platform (account type: business). They manage their own products, process orders through a POS terminal, handle cashier staff, and view revenue analytics. New business accounts start with a "pending" approval status until an admin approves them.'),

  h2('Supplier'),
  body('A wholesale seller (account type: supplier). Suppliers operate like businesses but cater to bulk/wholesale orders. They also go through an admin approval process.'),

  h2('Admin'),
  body('A platform administrator. Full access to all data — they can approve/reject businesses, manage the product catalog, oversee all orders and users, and add team members.'),

  h2('Semi-Admin (Viewer)'),
  body('A read-only administrator. Can view the same data as an admin but cannot modify anything — cannot approve businesses, edit products, or delete records.'),

  h2('Cashier (Staff)'),
  body('A staff member assigned to a business. Cashiers can only access the POS screen. Their access is controlled by privilege flags set by the business owner (e.g. pos, inventory, customers). Cashiers log in with a PIN, not a Supabase account.'),

  /* ═══════════════════════════════════════════════════════════
     3. PAGES
  ═══════════════════════════════════════════════════════════ */
  new Paragraph({ pageBreakBefore: true, children: [] }),
  h1('3. Pages — Detailed Functionality'),

  /* 3.1 Explore */
  ...pageSection(
    'Explore (Home)',
    '/#/',
    '🏠',
    'The main landing page. Displays a grid of all products from the catalog, organized by categories. Visitors can browse freely without logging in. A floating cart drawer accumulates items as the user shops.',
    [
      'Category filter bar — tap a category chip to filter the grid',
      'Product cards — show image, name, price, rating, stock badge',
      'Cart drawer — appears on the right, persists across navigation',
      'Supplier badges — verified checkmark shown on cards from approved sellers',
      'Pull-to-refresh — reloads product data from the API',
    ],
    [
      { feature: 'View all products', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Filter by category', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Add item to cart', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'View cart drawer', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Proceed to checkout', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
    ]
  ),

  /* 3.2 Search */
  ...pageSection(
    'Search',
    '/#/search',
    '🔍',
    'Full-text product search. Results update as the user types. Shows matching products with the same card style as the Explore page.',
    [
      'Instant search — debounced input, no submit button needed',
      'Matches product name and description',
      'Empty state with helpful prompt when nothing found',
      'Add-to-cart directly from search results',
    ],
    [
      { feature: 'Search products', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Add to cart from results', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
    ]
  ),

  /* 3.3 Product Detail */
  ...pageSection(
    'Product Detail',
    '/#/product/:id',
    '📦',
    'Full detail page for a single product. Shows all product information, seller info, customer reviews, and related products.',
    [
      'Product image, name, price, rating, category',
      'Stock level indicator (in stock / low stock / out of stock)',
      'Quantity selector — cannot exceed available stock',
      'Add to cart button',
      'Seller info card with link to their storefront',
      'Customer reviews section — average rating + individual reviews',
      'Leave a review — authenticated customers who ordered this product',
      'Related products grid at the bottom',
      'AI product description — if enabled, shows AI-generated summary',
    ],
    [
      { feature: 'View product details', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Add to cart', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Read reviews', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Write a review', guest: false, customer: true, business: false, supplier: false, admin: false, cashier: false },
      { feature: 'Chat with seller', guest: false, customer: true, business: false, supplier: false, admin: false, cashier: false },
    ]
  ),

  /* 3.4 Supplier Storefront */
  ...pageSection(
    'Supplier / Business Storefront',
    '/#/:slug  or  /#/supplier/:id',
    '🏪',
    'Public storefront page for a business or supplier. Accessible to everyone. Shows the seller\'s profile, product listings, and contact options.',
    [
      'Seller banner with name, icon, location, bio, categories, contact numbers',
      'Verified badge (blue checkmark) if the seller is approved',
      'Product grid filtered to only that seller\'s products',
      'Star rating and review count',
      'Minimum order amount (for suppliers)',
      'Delivery days estimate',
      '"Message" button to open a chat — requires login',
      'Wishlist button on product cards',
    ],
    [
      { feature: 'View storefront', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'View products', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Start a chat', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Add product to cart', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
    ]
  ),

  /* 3.5 Suppliers List */
  ...pageSection(
    'Suppliers List',
    '/#/suppliers',
    '🏭',
    'A directory of all suppliers on the platform. Browse and filter wholesale sellers by category, location, rating, and more.',
    [
      'Grid of supplier cards with rating, location, category tags',
      'Verified badge on approved suppliers',
      'Filter by category, location, min order range',
      'Sort by rating, reviews, minimum order',
      'Tap a card to open the supplier\'s storefront',
    ],
    [
      { feature: 'Browse suppliers', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Filter / sort', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Visit storefront', guest: true, customer: true, business: true, supplier: true, admin: true, cashier: false },
    ]
  ),

  /* 3.6 Checkout */
  ...pageSection(
    'Checkout',
    '/#/checkout',
    '🛒',
    'The checkout flow converts the cart into a confirmed order. Requires the user to be logged in.',
    [
      'Order summary — list of cart items with quantities and prices',
      'Subtotal, discount, and total calculation',
      'Coupon code field — validates against active coupons and applies discount',
      'Delivery address — select from saved addresses or enter a new one',
      'Order notes / special instructions',
      'Place Order button — creates the order in the database and clears the cart',
      'Success screen with order reference number',
    ],
    [
      { feature: 'View cart summary', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Apply coupon', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Select delivery address', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Place order', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
    ]
  ),

  /* 3.7 Orders */
  ...pageSection(
    'Orders & Order Tracking',
    '/#/orders  and  /#/orders/:id',
    '📋',
    'Lists all orders placed by the current user (customer) or received by the business/supplier. Each order can be opened to see full details and tracking.',
    [
      'Order list with status badges — pending, processing, completed, cancelled',
      'Date, total amount, item count',
      'Filter by status',
      'Order detail page — full item list, QR code for pickup, seller info',
      'QR code scanning — businesses can scan a customer QR to confirm pickup',
      'Order timeline — placed, confirmed, shipped, delivered steps',
      'Business view — shows ALL orders received (not just theirs)',
      'Admin view — sees every order across the platform',
    ],
    [
      { feature: 'View own orders (as buyer)', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'View orders received (as seller)', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'View all platform orders', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'Update order status', guest: false, customer: false, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Cancel order', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Generate / view QR receipt', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
    ]
  ),

  /* 3.8 Profile */
  ...pageSection(
    'Profile',
    '/#/profile',
    '👤',
    'The personal profile page for the logged-in user. Shows account details and allows editing. Also the starting point for managing business/supplier account info.',
    [
      'Display name, avatar emoji, email address',
      'Phone number (editable)',
      'Account type badge (Customer / Business / Supplier)',
      'Approval status for business/supplier accounts',
      'Request approval button — business/supplier sends approval request to admin',
      'Saved addresses — add, edit, delete delivery addresses',
      'Referral code — unique code to share with others',
      'Sign out button',
      'Verification request — business/supplier can submit verification docs',
    ],
    [
      { feature: 'View own profile', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Edit name / phone / avatar', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Manage addresses', guest: false, customer: true, business: false, supplier: false, admin: false, cashier: false },
      { feature: 'Request business approval', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Submit verification request', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'View referral code', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
    ]
  ),

  /* 3.9 Chat */
  ...pageSection(
    'Chat',
    '/#/chat  and  /#/chat/:id',
    '💬',
    'Real-time 1-on-1 messaging between customers and businesses/suppliers. Chat list shows all active conversations; tapping one opens the chat room.',
    [
      'Conversation list — sorted by most recent message',
      'Unread message badge on conversations',
      'Message bubbles with timestamps',
      'Send text messages',
      'Participant name and avatar in the header',
      'Businesses and suppliers can see all chats they are part of',
    ],
    [
      { feature: 'View chat list', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Send messages', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Receive messages', guest: false, customer: true, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Start new conversation', guest: false, customer: true, business: false, supplier: false, admin: false, cashier: false },
    ]
  ),

  /* 3.10 Notifications */
  ...pageSection(
    'Notifications',
    '/#/notifications',
    '🔔',
    'In-app notification center. Shows alerts for order status changes, new messages, approval decisions, and platform announcements.',
    [
      'List of all notifications sorted newest first',
      'Read / unread state with bold text for unread',
      'Tap a notification to mark it read',
      'Mark all as read button',
      'Icons differentiate notification types (order, chat, system)',
    ],
    [
      { feature: 'View notifications', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Mark read', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Delete notification', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
    ]
  ),

  /* 3.11 Settings */
  ...pageSection(
    'Settings',
    '/#/settings',
    '⚙️',
    'Application settings for the logged-in user. Controls display preferences and account-level options.',
    [
      'Dark / light theme toggle',
      'Language selection (if multi-language is enabled)',
      'Notification preferences',
      'Business/supplier account: hide stock levels from customers toggle',
      'Account deletion request',
    ],
    [
      { feature: 'Toggle dark mode', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Change language', guest: false, customer: true, business: true, supplier: true, admin: true, cashier: false },
      { feature: 'Hide stock from customers', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
    ]
  ),

  /* 3.12 Business Dashboard */
  ...pageSection(
    'Business Dashboard',
    '/#/dashboard',
    '📊',
    'Analytics and revenue overview for business and supplier accounts. Shows key performance metrics at a glance.',
    [
      'Total revenue — all time, this month, today',
      'Order count for the current month',
      'Revenue trend chart — 6-month sparkline',
      'Recent orders table — last 5 orders with status',
      'Top-selling products',
      'Category breakdown',
      'Low-stock alert cards',
    ],
    [
      { feature: 'View revenue stats', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'View order history', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'View top products', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
    ]
  ),

  /* 3.13 Inventory */
  ...pageSection(
    'Inventory',
    '/#/inventory',
    '📦',
    'Product inventory management for businesses and suppliers. Add new products, edit existing ones, adjust stock levels, and remove listings.',
    [
      'Product list with stock level, price, category',
      'Add product — name, price, stock, category, image upload, AI description generator',
      'Edit product — update any field',
      'Adjust stock — quick +/− buttons, or set exact quantity',
      'Delete / deactivate product',
      'Barcode scanner — scan a product barcode to look it up or add it',
      'Claim global product — link your business to an existing catalog product',
      'Low-stock badges on items below threshold',
      'Bulk price update',
    ],
    [
      { feature: 'View own products', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: 'read' },
      { feature: 'Add new product', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Edit product details', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'Adjust stock quantity', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: true },
      { feature: 'Delete product', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
      { feature: 'AI description generator', guest: false, customer: false, business: true, supplier: true, admin: false, cashier: false },
    ]
  ),

  /* 3.14 Customers */
  ...pageSection(
    'Customers',
    '/#/customers',
    '👥',
    'A list of all customers who have placed orders with this business. Helps businesses track their customer base.',
    [
      'Table of customers with name, contact, total spend, order count',
      'Search by name or phone',
      'View individual customer order history',
      'Export customer list',
    ],
    [
      { feature: 'View customer list', guest: false, customer: false, business: true, supplier: true, admin: true, cashier: true },
      { feature: 'Search customers', guest: false, customer: false, business: true, supplier: true, admin: true, cashier: true },
      { feature: 'View customer orders', guest: false, customer: false, business: true, supplier: true, admin: true, cashier: false },
    ]
  ),

  /* 3.15 POS */
  ...pageSection(
    'Point of Sale (POS)',
    '/#/pos',
    '🖨️',
    'An in-store sales terminal for processing face-to-face transactions. Business owners and authorized cashiers use this to ring up sales without the customer needing to use the app.',
    [
      'Product search — type to find items by name or scan barcode',
      'Cart panel — add items, set quantities, remove lines',
      'Customer selector — link the sale to a known customer account',
      'Coupon / discount application',
      'Cash / card payment modes',
      'Cash tendered and change calculation',
      'Receipt generation — printable receipt with QR code',
      'Parked carts — save and resume a transaction',
      'POS session — open / close the cash drawer session with Z-report',
      'Cashier login gate — cashier must enter PIN before using POS',
    ],
    [
      { feature: 'Access POS terminal', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: true },
      { feature: 'Search and add products', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: true },
      { feature: 'Apply discount / coupon', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: true },
      { feature: 'Process payment', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: true },
      { feature: 'Print receipt', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: true },
      { feature: 'Open / close session', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: 'if privilege' },
      { feature: 'Park and resume cart', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: true },
    ]
  ),

  /* 3.16 Staff */
  ...pageSection(
    'Staff Management',
    '/#/staff',
    '🪪',
    'Create and manage cashier / staff accounts for the business. Each staff member gets a PIN for the POS login and a configurable set of privileges.',
    [
      'Cashier list — name, PIN (masked), status, privileges',
      'Add cashier — set name, PIN, and privilege flags',
      'Edit cashier — change name, PIN, update privileges',
      'Privilege flags: pos, inventory, customers, reports',
      'Deactivate / delete a cashier',
      'Active session indicator — see if a cashier is currently logged in to POS',
    ],
    [
      { feature: 'View staff list', guest: false, customer: false, business: true, supplier: false, admin: true, cashier: false },
      { feature: 'Add cashier', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: false },
      { feature: 'Edit / delete cashier', guest: false, customer: false, business: true, supplier: false, admin: true, cashier: false },
      { feature: 'Set cashier privileges', guest: false, customer: false, business: true, supplier: false, admin: false, cashier: false },
    ]
  ),

  /* 3.17 Cashier Login */
  ...pageSection(
    'Cashier Login',
    '/#/cashier-login',
    '🔑',
    'PIN-based login screen for cashier / staff. Does not use Supabase auth — cashiers log in using the 4-digit PIN set by their business owner. This creates a local session that allows access to the POS.',
    [
      'Business name lookup — cashier enters the business name first',
      'Cashier name selection — choose from the list of active cashiers',
      'PIN pad — 4-digit entry',
      'Session is stored locally (no password reset required)',
      'Automatic redirect to POS on successful login',
      'Logout option from the POS screen',
    ],
    [
      { feature: 'Access cashier login', guest: true, customer: false, business: false, supplier: false, admin: false, cashier: true },
      { feature: 'Enter PIN to log in', guest: false, customer: false, business: false, supplier: false, admin: false, cashier: true },
    ]
  ),

  /* 3.18 Admin Panel */
  ...pageSection(
    'Admin Panel',
    '/#/admin',
    '🛡️',
    'The platform administration dashboard. Accessible only to users listed in the admins table. Full oversight and control of all platform data.',
    [
      'Overview tab — key stats: total businesses, products, orders, users, pending verifications; recent orders',
      'Businesses tab — list of all business and supplier accounts with approval status; Approve / Reject buttons for pending accounts; edit business details; toggle verified badge',
      'Products tab — full product catalog; add, edit, delete any product; assign to business',
      'Orders tab — all platform orders; filter by status; update any order status',
      'Users tab — all registered customer accounts; view profile details',
      'Team tab — manage admin team; add new admins; assign admin or semi-admin (viewer) role; remove admins',
    ],
    [
      { feature: 'View overview stats', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'View businesses list', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'Approve / reject business', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'Edit any business', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'View all products', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'Add / edit / delete product', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'View all orders', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'Update any order status', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'View all users', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'Add / remove admin team', guest: false, customer: false, business: false, supplier: false, admin: true, cashier: false },
      { feature: 'View-only mode (semi-admin)', guest: false, customer: false, business: false, supplier: false, admin: 'full', cashier: false },
    ]
  ),

  /* 3.19 Sign Up */
  ...pageSection(
    'Sign Up',
    '/#/auth/signup',
    '✏️',
    'Account creation page. Users choose their account type first (Customer, Business, or Supplier), then sign up with email/password or Google OAuth.',
    [
      'Step 1 — Choose account type: Customer, Business, or Supplier',
      'Step 2 — Enter name (or business name) and credentials',
      'Email flow — email + password; min 6 characters; confirm password',
      'Google flow — redirects to Google OAuth, returns to /auth/callback',
      'After email signup, a profile or supplier record is automatically created',
      'If email confirmation is required, user is shown a "check your email" screen',
      'Business/Supplier registrations are created with "pending" approval status',
    ],
    [
      { feature: 'Sign up as customer', guest: true, customer: false, business: false, supplier: false, admin: false, cashier: false },
      { feature: 'Sign up as business', guest: true, customer: false, business: false, supplier: false, admin: false, cashier: false },
      { feature: 'Sign up as supplier', guest: true, customer: false, business: false, supplier: false, admin: false, cashier: false },
    ]
  ),

  /* 3.20 Sign In */
  ...pageSection(
    'Sign In',
    '/#/auth/login',
    '🔐',
    'Login page for registered users. Supports email/password and Google OAuth.',
    [
      'Email/password form with show/hide password toggle',
      'Google OAuth button — one-tap sign in',
      'Forgot password link (sends Supabase reset email)',
      'Link to sign up page',
      'Redirect to profile after successful login',
      'Error messages for wrong credentials',
    ],
    [
      { feature: 'Log in with email', guest: true, customer: false, business: false, supplier: false, admin: false, cashier: false },
      { feature: 'Log in with Google', guest: true, customer: false, business: false, supplier: false, admin: false, cashier: false },
    ]
  ),

  /* ═══════════════════════════════════════════════════════════
     4. KEY WORKFLOWS
  ═══════════════════════════════════════════════════════════ */
  new Paragraph({ pageBreakBefore: true, children: [] }),
  h1('4. Key Workflows'),

  h2('Customer Purchase Flow'),
  bullet('1. Browse Explore or Search → add items to cart'),
  bullet('2. Open cart drawer → review items → tap "Checkout"'),
  bullet('3. Log in if not already (redirect back to checkout)'),
  bullet('4. Apply coupon code (optional) → select delivery address'),
  bullet('5. Tap "Place Order" → order created with status "pending"'),
  bullet('6. Receive order confirmation with reference number'),
  bullet('7. Track order at /#/orders/:id — status updates by the seller'),

  spacer(0.5),
  h2('Business Onboarding & Approval Flow'),
  bullet('1. Register at /#/auth/signup → choose "Business" account type'),
  bullet('2. Account created with approval_status = pending'),
  bullet('3. Admin sees the new business in Admin Panel → Businesses tab with "🕐 Wants approval" badge'),
  bullet('4. Admin clicks "✔ Approve" → approval_status set to "approved"'),
  bullet('5. Business can now fully use the platform — dashboard, POS, inventory'),
  bullet('6. Business can optionally submit a verification request for the verified badge'),

  spacer(0.5),
  h2('POS Sale Flow'),
  bullet('1. Cashier goes to /#/cashier-login → selects business and cashier → enters PIN'),
  bullet('2. Redirected to POS screen (/#/pos)'),
  bullet('3. Search for product → tap to add to cart'),
  bullet('4. Optionally link a customer, apply coupon, or park the cart'),
  bullet('5. Choose cash or card → enter amount tendered'),
  bullet('6. Tap "Complete Sale" → order created → receipt generated'),
  bullet('7. Print or show QR receipt to customer'),

  spacer(0.5),
  h2('Cashier Session (Z-Report)'),
  bullet('1. Business owner opens a POS session at the start of the day (opening float)'),
  bullet('2. Each cashier sale is linked to the session'),
  bullet('3. At end of day, owner closes the session → Z-report computed server-side'),
  bullet('4. Report shows expected cash, actual cash, discrepancy'),

  spacer(0.5),
  h2('Business Verification Flow'),
  bullet('1. Business submits a verification request from /#/profile'),
  bullet('2. Admin sees "pending verifications" count on the overview tab'),
  bullet('3. Admin reviews and clicks Approve → supplier.verified = true, badge = "Verified"'),
  bullet('4. Verified badge ✅ now appears on the storefront and product cards'),

  /* ═══════════════════════════════════════════════════════════
     5. API OVERVIEW
  ═══════════════════════════════════════════════════════════ */
  new Paragraph({ pageBreakBefore: true, children: [] }),
  h1('5. API Overview'),
  body('All API routes live under /api/. They use the Supabase service-role key (bypasses Row Level Security) so authentication is handled at the application level, not the database level. All responses are JSON.'),
  spacer(0.5),

  ...([
    ['/api/profile',                  'GET (by userId), POST (create), PATCH (update)',     'Customer profile records'],
    ['/api/suppliers',                'GET (list or by authUserId), POST (create)',           'Business & supplier accounts'],
    ['/api/suppliers/[id]',           'GET, PATCH (edit), DELETE',                           'Single supplier operations'],
    ['/api/suppliers/[id]/request-approval', 'POST',                                        'Business requests approval (trial→pending)'],
    ['/api/products',                 'GET (list), POST (create)',                            'Global product catalog'],
    ['/api/products/[id]',            'GET, PATCH, DELETE',                                  'Single product'],
    ['/api/business-products',        'GET, POST',                                           'Seller\'s claimed product listings'],
    ['/api/inventory',                'GET, POST (upsert stock)',                             'Stock levels'],
    ['/api/orders',                   'GET, POST (place order)',                              'Order creation & list'],
    ['/api/orders/[id]',              'GET, PATCH (status update), DELETE',                  'Single order'],
    ['/api/cashiers',                 'GET, POST',                                           'Staff / cashier accounts'],
    ['/api/cashiers/login',           'POST (PIN auth)',                                     'Cashier PIN login'],
    ['/api/pos-sessions',             'GET, POST (open session)',                             'POS cash-drawer sessions'],
    ['/api/coupons',                  'GET, POST',                                           'Discount coupon management'],
    ['/api/coupons/validate',         'POST',                                                'Validate & apply a coupon code'],
    ['/api/conversations',            'GET, POST',                                           'Chat conversation threads'],
    ['/api/conversations/[id]/messages', 'GET, POST',                                       'Chat messages in a thread'],
    ['/api/notifications',            'GET, POST',                                           'Notification records'],
    ['/api/addresses',                'GET, POST',                                           'Saved delivery addresses'],
    ['/api/verification-requests',    'GET, POST, PATCH (admin review)',                     'Seller verification submissions'],
    ['/api/admin/check',              'GET — is uid an admin?',                              'Admin role check'],
    ['/api/admin/admins',             'GET, POST',                                           'Admin team management'],
    ['/api/admin/stats',              'GET',                                                 'Platform-wide statistics'],
    ['/api/admin/users',              'GET',                                                 'All user profiles (admin only)'],
    ['/api/ai/describe-product',      'POST — generates AI product description',             'Anthropic SDK — product copy'],
    ['/api/wishlist',                 'GET, POST, DELETE',                                   'User wishlisted products'],
    ['/api/referrals',                'GET, POST',                                           'Referral codes'],
    ['/api/reviews',                  'GET, POST',                                           'Product reviews'],
    ['/api/customers',                'GET — business\'s customer list',                    'Customer analytics per business'],
  ].map(([route, methods, desc]) => {
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 10500, type: WidthType.DXA },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: 3200, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: 'F8FAFF' },
            borders: thinBorder,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: route, size: 18, font: 'Courier New', color: PRIMARY, bold: true })] })],
          }),
          new TableCell({
            width: { size: 3500, type: WidthType.DXA },
            borders: thinBorder,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: methods, size: 18, font: 'Calibri', color: '374151' })] })],
          }),
          new TableCell({
            width: { size: 3800, type: WidthType.DXA },
            borders: thinBorder,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: desc, size: 18, font: 'Calibri', color: MUTED })] })],
          }),
        ],
      })],
    });
  })),

  spacer(2),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '— End of Document —', size: 20, color: MUTED, font: 'Calibri' })],
  }),
];

/* ── Build and write ──────────────────────────────────────────── */
const doc = new Document({
  numbering: {
    config: [{
      reference: 'default-bullets',
      levels: [
        { level: 0, format: NumberFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) } } } },
        { level: 1, format: NumberFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } } },
      ],
    }],
  },
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22, color: '111827' } },
    },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1',
        run:  { bold: true, size: 36, color: PRIMARY, font: 'Calibri' },
        paragraph: { spacing: { before: 400, after: 120 } } },
      { id: 'Heading2', name: 'Heading 2',
        run:  { bold: true, size: 28, color: ACCENT, font: 'Calibri' },
        paragraph: { spacing: { before: 320, after: 80 } } },
      { id: 'Heading3', name: 'Heading 3',
        run:  { bold: true, size: 24, color: PRIMARY, font: 'Calibri' },
        paragraph: { spacing: { before: 240, after: 60 } } },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top:    convertInchesToTwip(1),
          right:  convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left:   convertInchesToTwip(1),
        },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' } },
            children: [
              new TextRun({ text: 'Mogarenta Platform Guide', size: 18, color: MUTED, font: 'Calibri' }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' } },
            children: [
              new TextRun({ text: 'Page ', size: 16, color: MUTED, font: 'Calibri' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: 'Calibri' }),
              new TextRun({ text: ' of ', size: 16, color: MUTED, font: 'Calibri' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED, font: 'Calibri' }),
            ],
          }),
        ],
      }),
    },
    children,
  }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync('Mogarenta-Platform-Guide.docx', buf);
console.log('✅  Mogarenta-Platform-Guide.docx written successfully');
