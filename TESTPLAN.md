# Mogarenta — Manual QA Test Plan

**Version:** v3.2 (updated 2026-06-16)  
**App URL (dev):** `http://localhost:3000`  
**Supabase project:** `knnrmdkzoicjuuaaownb`

---

## Pre-flight checklist

Before running any section:

- [ ] Only ONE `npm run dev` instance running (two instances = `.next` lock conflict → blank page)
- [ ] Supabase project is **active** (not paused) — paused project = empty catalog by design
- [ ] `migration_v3_1.sql` applied on the live DB (required for avatar, bio, GPS, agent role, VAT)
- [ ] Email confirmation is **OFF** in Supabase Auth settings
- [ ] Test accounts created (real-looking domains only — Supabase rejects fake domains):

| Role | Email | Password |
|------|-------|----------|
| Consumer | `test.user@gmail.com` | `Test1234!` |
| Business | `test.biz@gmail.com` | `Test1234!` |
| Supplier | `test.supplier@gmail.com` | `Test1234!` |
| Agent | `test.agent@gmail.com` | `Test1234!` |
| Admin | (already in `admins` table) | — |

> Create accounts via: `node scripts/seed-test-users.mjs` (bypasses email rate limits)

**Legend:** ✅ Pass · ❌ Fail · ⚠️ Known issue · — Not applicable

---

## 1. Boot & routing shell

| # | Steps | Expected |
|---|---|---|
| 1.1 | Open `http://localhost:3000/` | ✅ Splash → Explore renders at `/#/`; no console errors; no hydration warnings |
| 1.2 | Navigate to `http://localhost:3000/orders` | ✅ Redirects to `/#/orders`; Orders page renders |
| 1.3 | Open `/#/no/such/route` | ✅ "Page not found" screen with **Back to shop** link |
| 1.4 | Press browser Back/Forward across 3+ hash routes | ✅ Each route matches the visible view exactly |
| 1.5 | Reload on `/#/settings` | ✅ Settings page re-renders; no flash to wrong page |
| 1.6 | Open `/#/` with the OAuth callback hash `/#access_token=abc123&type=recovery` | ✅ App does NOT treat it as a route — no "page not found" |

---

## 2. Explore & product grid (`#/`)

| # | Steps | Expected |
|---|---|---|
| 2.1 | Load with active DB | ✅ Hot-deals banner, category chips, Best Sellers row, product grid with photos/prices |
| 2.2 | Load with paused/dead DB | ✅ Empty grid (no seeded fallback) — "No products" empty state, no crash |
| 2.3 | Type in the header search bar | ✅ Grid filters live (name/description/SKU/brand/tags); banner and Best Sellers hide while searching |
| 2.4 | Clear the search | ✅ Full grid returns; banner reappears |
| 2.5 | Tap a category chip | ✅ Grid shows only that category; count label updates |
| 2.6 | Signed in as **guest or consumer** | ✅ No B2B-only products visible |
| 2.7 | Signed in as **business or supplier** | ✅ B2B products visible with tier pricing / MOQ |
| 2.8 | Tap a product card | ✅ Navigates to `#/product/<id>` |
| 2.9 | Tap heart icon on a card | ✅ Toggles wishlist instantly; badge animation; persists after reload (localStorage); syncs to DB when signed in |
| 2.10 | "+ Add to Cart" on in-stock product | ✅ Cart badge increments with bump animation; toast appears |
| 2.11 | "+ Add to Cart" on out-of-stock | ✅ Button reads "Out of stock" and is disabled |
| 2.12 | Product card with `taxMode = 'included'` | ✅ Small green "VAT incl." badge shows next to price |
| 2.13 | Product card with `taxMode = 'excluded'` | ✅ Small amber "+5% VAT" badge shows next to price |

---

## 3. Product detail (`#/product/:id`)

| # | Steps | Expected |
|---|---|---|
| 3.1 | Open a valid product | ✅ Photo gallery (or icon fallback), price, strikethrough original, discount %, stock count, description, tags, SKU, supplier chip |
| 3.2 | Open `#/product/99999` (unknown) | ✅ "Product not found" + Go Home — no crash |
| 3.3 | Increment qty stepper | ✅ Cannot exceed available stock |
| 3.4 | Tap Add to Cart | ✅ Adds chosen qty; cannot exceed stock; toast confirms |
| 3.5 | Tap Buy Now | ✅ Adds to cart and navigates straight to `#/checkout` |
| 3.6 | Tap photo → lightbox | ✅ Opens full-size; multi-photo carousel (swipe or thumb); closes on ✕ or backdrop tap |
| 3.7 | Submit a review (signed in) | ✅ Rating stars + comment saves; appears immediately; persists on reload |
| 3.8 | Attempt duplicate review | ✅ Previous review replaced, not doubled |
| 3.9 | Product with `taxMode = 'included'` | ✅ "VAT incl." badge in price row |
| 3.10 | Product with `taxMode = 'excluded'` | ✅ "+5% VAT at checkout" badge in price row |
| 3.11 | Tap supplier chip | ✅ Navigates to `#/supplier/<id>` |

---

## 4. Cart & checkout (`#/checkout`)

| # | Steps | Expected |
|---|---|---|
| 4.1 | Open cart drawer (header cart icon) | ✅ Slides in from right; shows product lines, qty steppers, unit prices, subtotal |
| 4.2 | Change qty inside drawer | ✅ Subtotal updates immediately |
| 4.3 | Remove item / clear all | ✅ Drawer shows empty state when cleared |
| 4.4 | Open `#/checkout` with empty cart | ✅ "Cart is empty" + Browse Products button |
| 4.5 | Apply valid coupon | ✅ Discount line appears with savings amount and code name |
| 4.6 | Apply expired / wrong / below-min-order coupon | ✅ Specific error message; no discount applied |
| 4.7 | Remove applied coupon | ✅ Discount line disappears; total reverts |
| 4.8 | Cart with VAT-excluded products | ✅ Order summary shows a separate "VAT (5%)" line; total = subtotal + VAT − discount |
| 4.9 | Cart with VAT-included products | ✅ No VAT line added (price already includes it); subtotal unchanged |
| 4.10 | Cart with VAT-none products | ✅ No VAT line; total = subtotal − discount |
| 4.11 | GPS delivery address: tap "Use My Current Location" | ✅ Browser prompts for location; captured coords shown; Save stores the address |
| 4.12 | Place order — Waafi demo flow | ✅ Pending spinner ~3.5 s → Success screen; order ID starts `ORD-` |
| 4.13 | Tamper test: edit price in DevTools before checkout | ✅ Receipt total = **server DB price** — client-sent prices are ignored |
| 4.14 | Order qty > available stock | ✅ 409 error toast "Insufficient stock"; cart intact; no order created |
| 4.15 | Place order with no internet (DevTools → offline) | ✅ "Network error — order NOT placed" toast; cart intact |
| 4.16 | After successful order | ✅ Cart cleared; stock decremented; order visible at `#/orders` |

---

## 5. Orders (`#/orders`, `#/orders/:id`)

| # | Steps | Expected |
|---|---|---|
| 5.1 | Guest opens `#/orders` | ✅ "Sign in to view orders" prompt |
| 5.2 | Consumer with placed orders | ✅ Own orders only, newest first; expanding row shows line items |
| 5.3 | Open `#/orders/<id>` tracking | ✅ Timeline (Placed → Processing → Shipped → Delivered) with current step highlighted; cancelled shows cancelled state |
| 5.4 | Unknown order ID | ✅ "Order not found" empty state |
| 5.5 | Business: All Orders tab | ✅ All orders across all customers visible |
| 5.6 | Business: change order status | ✅ Status updates in DB; tracking page reflects new status |
| 5.7 | Business: delete an order | ✅ Confirm dialog → order stays in list with grey "🗑 Deleted" badge; revenue drops by that amount on Dashboard |
| 5.8 | Dashboard revenue after delete | ✅ Total, today's, and monthly revenue all exclude deleted/cancelled/refunded orders |

---

## 6. Role access control (run for EVERY role)

Test each URL for: **guest**, **consumer (user)**, **supplier**, **field agent**.

| # | Steps | Expected |
|---|---|---|
| 6.1 | Visit `#/dashboard`, `#/pos`, `#/inventory`, `#/customers`, `#/suppliers`, `#/admin`, `#/staff` directly by URL | ✅ 🔒 "Business area" restricted screen — never the actual page |
| 6.2 | Restricted screen CTA — guest | ✅ "Sign In" button |
| 6.3 | Restricted screen CTA — consumer | ✅ "Back to Shop" button |
| 6.4 | Restricted screen CTA — supplier | ✅ "My Supplier Profile" button |
| 6.5 | Restricted screen CTA — agent | ✅ "Back to Shop" button |
| 6.6 | Sidebar (desktop, >960px) — non-business | ✅ No Dashboard / POS / Inventory / Customers / Suppliers / Staff links |
| 6.7 | Mobile drawer (hamburger) — non-business | ✅ Same — no business-only links |
| 6.8 | Bottom nav — non-business | ✅ Second slot = **Orders** (not POS) |
| 6.9 | Sign in as **business**, repeat 6.1 | ✅ All pages open; all links present; bottom nav second slot = **POS** |
| 6.10 | Hard-reload while ON `#/dashboard` as business | ✅ Auth restores silently → Dashboard renders — no flash of the lock screen |

---

## 7. Business pages (sign in as business account)

| # | Steps | Expected |
|---|---|---|
| 7.1 | `#/dashboard` | ✅ Revenue/orders/units/suppliers stat cards; 6-month revenue chart; category pie; recent orders list |
| 7.2 | POS: add items by tapping, apply discount, complete sale (Cash) | ✅ Cart math correct; receipt shows correct totals; stock decrements |
| 7.3 | POS: barcode scan (camera on real device) | ✅ Known barcode → adds product; unknown → "not found" toast |
| 7.4 | POS: open/close session | ✅ Session creates on open; closing shows expected-vs-counted discrepancy |
| 7.5 | Inventory: `−` / `+` stock buttons | ✅ Updates immediately; persists after reload |
| 7.6 | Inventory: bulk restock (↑ button) | ✅ Prompt accepts qty; updates correctly |
| 7.7 | Inventory: Add Product form | ✅ All fields save; product appears on Explore |
| 7.8 | Inventory: **VAT / Tax picker** — choose "No Tax" | ✅ Product card shows no tax badge on Explore |
| 7.9 | Inventory: **VAT / Tax picker** — choose "Tax Included" | ✅ Product card shows green "VAT incl." badge |
| 7.10 | Inventory: **VAT / Tax picker** — choose "Tax Excluded" | ✅ Product card shows amber "+5% VAT" badge; checkout adds 5% line |
| 7.11 | Inventory: Edit an existing product, change tax mode | ✅ Change persists; badge updates on Explore |
| 7.12 | Inventory: barcode field — scan in-modal | ✅ Camera detects barcode and fills the field |
| 7.13 | Inventory: image URL field | ✅ Preview thumbnail updates as you type; image appears on product card |
| 7.14 | Inventory: AI description button | ✅ Fills description field (requires `ANTHROPIC_API_KEY` in `.env.local`) |
| 7.15 | Customers: add / edit / delete customer | ✅ Table updates; delete shows confirmation |
| 7.16 | Suppliers directory: send a bulk inquiry | ✅ Creates `BULK-…` order with `bulk_pending` status; stock NOT decremented |
| 7.17 | Staff: add/remove cashier | ✅ Cashier can log in at `#/cashier-login`; limited to their privileges |

---

## 8. Supplier account (sign in as supplier)

| # | Steps | Expected |
|---|---|---|
| 8.1 | `#/profile` — supplier dashboard | ✅ Store header, product/order/revenue stats, Products / Sales / Settings tabs |
| 8.2 | Add a regular product | ✅ Visible on Explore for all users |
| 8.3 | Add a B2B product with tier pricing | ✅ Appears for business buyers on Explore; hidden from consumers and guests |
| 8.4 | CSV import | ✅ Valid rows import; malformed rows reported in error list, not silently dropped |
| 8.5 | Profile photo upload | ✅ Avatar URL saved; appears in supplier profile (`#/supplier/:id`) — **requires `migration_v3_1.sql` applied** |
| 8.6 | Store settings: name, bio | ✅ Saves and reflects on the public storefront |
| 8.7 | Public storefront `#/supplier/:id` as guest/consumer | ✅ Store info, product list, "Message" button; **no** edit controls |
| 8.8 | Bulk order button on supplier page (as business) | ✅ Creates bulk inquiry order |

---

## 9. Field Agent account (sign in as agent)

| # | Steps | Expected |
|---|---|---|
| 9.1 | Sign in as agent, open `#/dashboard` | ✅ 🔒 Restricted screen with "Back to Shop" CTA — agents don't have business access |
| 9.2 | Browse Explore, add to cart, checkout | ✅ Full shopping flow works as normal |
| 9.3 | Sidebar / mobile drawer / bottom nav | ✅ No business links; second slot = Orders |
| 9.4 | `#/profile` | ✅ Shows user profile (not supplier dashboard) |

---

## 10. Auth

| # | Steps | Expected |
|---|---|---|
| 10.1 | Sign up — email + password | ✅ Account created; lands signed-in without email confirmation (email confirm is OFF) |
| 10.2 | Sign up — choose Business or Supplier account type | ✅ Correct role applied immediately; business pages accessible |
| 10.3 | Sign up — choose Field Agent | ✅ Agent account created; restricted from business pages |
| 10.4 | Wrong password on sign-in | ✅ Clear error message; no crash |
| 10.5 | Google OAuth | ✅ Redirects to Google → back to `/auth/callback` → "Completing sign-in…" → lands at `#/profile` signed-in |
| 10.6 | Hard-reload after sign-in (both providers) | ✅ Still signed in; no flash of guest UI |
| 10.7 | Sign out (sidebar / mobile drawer) | ✅ Returns to guest UI everywhere (nav, profile, orders); reload stays signed out |
| 10.8 | Sign out then sign back in as different account type | ✅ UI switches roles correctly without stale state |

---

## 11. Chat (`#/chat`, `#/chat/:id`)

| # | Steps | Expected |
|---|---|---|
| 11.1 | Guest opens `#/chat` | ✅ Sign-in prompt |
| 11.2 | Open a conversation, send a text message | ✅ Message appears immediately; other participant receives it in near real-time (Supabase Realtime) |
| 11.3 | Send an image | ✅ Upload progress → image bubble; tap opens full size |
| 11.4 | Tap participant name/avatar | ✅ Profile modal: name, type badge, bio, contact numbers (tap-to-call links) |
| 11.5 | "Message" button on `#/supplier/:id` | ✅ Creates/opens conversation with that supplier |

---

## 12. Notifications, Search, Settings

| # | Steps | Expected |
|---|---|---|
| 12.1 | Alerts badge (bottom nav / sidebar) | ✅ Shows unread count; opening Notifications marks all read; badge clears |
| 12.2 | `#/search?q=phone` deep link | ✅ Results pre-filtered by `phone` from the hash query string |
| 12.3 | Settings: switch language (e.g. Arabic) | ✅ UI text translates; direction flips RTL; persists on reload |
| 12.4 | Settings: toggle dark mode | ✅ Full app re-themes; persists on reload |

---

## 13. Mobile layout & navigation (use 375px viewport or real device)

| # | Steps | Expected |
|---|---|---|
| 13.1 | **Portrait** — bottom nav visible | ✅ Five items (Explore / POS or Orders / Chat / Alerts / Login or Profile) fully visible above home indicator |
| 13.2 | **Landscape** (phone sideways) — bottom nav | ✅ Bottom nav stays **fixed** at the bottom of the screen — does NOT scroll away with page content |
| 13.3 | Bottom nav active tab highlight | ✅ Current route highlighted with primary colour + underline indicator |
| 13.4 | Bottom nav — non-business role | ✅ Second slot = "Orders" icon |
| 13.5 | Bottom nav — business role | ✅ Second slot = "POS" icon |
| 13.6 | Hamburger tap | ✅ Drawer slides in from left (~.35s); links stagger in; blurred overlay behind; page scroll locked |
| 13.7 | Drag drawer left past ~70px | ✅ Drawer closes; less than 70px = springs back |
| 13.8 | Swipe right from the left screen edge | ✅ Drawer opens |
| 13.9 | Tap overlay / ✕ / any link | ✅ Drawer closes; link navigates correctly |
| 13.10 | Logout button in mobile drawer | ✅ Red-tinted; tap signs out and navigates to login |
| 13.11 | 320px viewport — no horizontal scroll | ✅ Every page fits horizontally; tables scroll inside their own container only |
| 13.12 | 375px — header on small screen | ✅ Logo text collapses to icon only; search bar has usable width |
| 13.13 | Scroll to bottom of Product Detail | ✅ "Add to Cart" and "Buy Now" buttons fully accessible above bottom nav |
| 13.14 | Scroll to bottom of Checkout | ✅ Payment button not hidden behind bottom nav |
| 13.15 | Notched phone (iPhone with home indicator) | ✅ Bottom nav content clears the home bar; no items cropped |

---

## 14. Free trial & approval flow

> Trial config in `lib/trial.ts` → `TRIAL_DURATION_MS`. Set to 30 seconds for quick testing (default 5 min sample, production 7 days).

| # | Steps | Expected |
|---|---|---|
| 14.1 | New business account → open `#/dashboard` | ✅ Amber sticky banner "Free trial — X:XX left" counting down live |
| 14.2 | New supplier account → open `#/profile` | ✅ Same trial banner over supplier dashboard |
| 14.3 | Trial reaches 0:00 while on a gated page | ✅ Page swaps to "Your free trial has ended" + Request Approval — no reload needed |
| 14.4 | Expired trial → browse Explore/checkout | ✅ Shopping works; only business pages are gated |
| 14.5 | Click "Request Approval" | ✅ Status switches to "Pending review" + ↻ Check status button; second tap → "already requested" error |
| 14.6 | Admin at `#/admin` → Businesses tab | ✅ Account shows "🕐 Wants approval" badge; Approve and Reject buttons present |
| 14.7 | Admin approves → user taps ↻ Check status | ✅ Full access restored; no banner ever again |
| 14.8 | Admin rejects | ✅ User sees "Request not approved — contact support" |
| 14.9 | Pre-migration account (no approval columns) | ✅ Never gated — feature silently disabled |

---

## 15. Receipt QR & order soft-delete

| # | Steps | Expected |
|---|---|---|
| 15.1 | Complete checkout / POS sale → open receipt | ✅ QR code present above footer |
| 15.2 | Scan QR with a phone | ✅ Opens `/#/orders/<id>` showing live order from DB |
| 15.3 | Change order status, re-scan same printed QR | ✅ Shows updated status — QR links to live record, not a snapshot |
| 15.4 | Business deletes an order in admin view | ✅ Confirm dialog → order stays in list with grey "🗑 Deleted" badge |
| 15.5 | DB check after delete | ✅ Row still exists; `status = 'deleted'` — no hard-delete code path |
| 15.6 | Scan QR of a deleted order | ✅ Order page shows "deleted by store — kept for record only" banner |
| 15.7 | Dashboard revenue after deleting a $100 order | ✅ Revenue drops by $100; deleted/cancelled/refunded always excluded |

---

## 16. Offline & resilience

| # | Steps | Expected |
|---|---|---|
| 16.1 | Load once, then pause the Supabase project, reload | ✅ Catalog empty (no fake fallback); UI shows empty state — never hangs on skeleton forever |
| 16.2 | Slow network (DevTools → Slow 3G) | ✅ Skeletons appear; replaced by real data; stale-while-revalidate works |
| 16.3 | Go offline mid-session (DevTools → Offline) | ✅ Toast for any failed action; no crash; page still navigable |
| 16.4 | Install as PWA | ✅ Install banner appears; installed app opens to Explore; all navigation works |

---

## 17. VAT / Tax — full system test

*New in v3.2. Run this section whenever the tax mode or checkout flow is modified.*

| # | Steps | Expected |
|---|---|---|
| 17.1 | Business: Add Product → tax picker shows 3 options | ✅ "No Tax", "Tax Included", "Tax Excluded" — selected option highlighted in primary colour |
| 17.2 | Save product as **No Tax** | ✅ Product card on Explore has no tax badge |
| 17.3 | Save product as **Tax Included** | ✅ Green "VAT incl." badge on product card and detail page |
| 17.4 | Save product as **Tax Excluded** | ✅ Amber "+5% VAT" badge on card; "+5% VAT at checkout" on detail page |
| 17.5 | Edit existing product, change from None → Excluded | ✅ Badge updates immediately after save; Explore reflects change |
| 17.6 | Checkout with 1 × $100 Excluded-tax product | ✅ Summary shows: Subtotal $100 · VAT (5%) +$5.00 · Total $105.00 |
| 17.7 | Checkout with 1 × $100 Included-tax product | ✅ Summary shows: Subtotal $100 · Total $100.00 (no extra VAT line) |
| 17.8 | Checkout with 1 × $100 No-tax product | ✅ Summary shows: Subtotal $100 · Total $100.00 (no VAT line) |
| 17.9 | Mixed cart: 1 Excluded ($50) + 1 Included ($30) + 1 None ($20) | ✅ VAT line = $2.50 (5% of $50 only) · Total = $50+$30+$20+$2.50 = $102.50 |
| 17.10 | Mixed cart + coupon applied | ✅ Discount applied after VAT in summary; total = subtotal + VAT − discount |
| 17.11 | Dark mode: VAT badges | ✅ Green badge readable on dark background; amber badge readable on dark background |

---

## 18. Database migration status

Run these checks if any migration is uncertain:

| # | Check | How to verify |
|---|---|---|
| 18.1 | `products.tax_mode` column exists | SQL: `SELECT tax_mode FROM products LIMIT 1;` — should not error |
| 18.2 | `profiles.avatar_url` and `profiles.bio` exist | SQL: `SELECT avatar_url, bio FROM profiles LIMIT 1;` |
| 18.3 | `addresses` GPS columns exist | SQL: `SELECT latitude, longitude, notes FROM addresses LIMIT 1;` |
| 18.4 | Agent role allowed in `suppliers` table | SQL: `INSERT INTO suppliers (..., account_type) VALUES (..., 'agent');` — should not violate CHECK |

---

## Automated test coverage (`npm test`)

Must be **100% green** before every release.

| Area | File | What's locked down |
|---|---|---|
| Hash routing & OAuth-hash immunity | `tests/hashRouter.test.tsx` | `#/x?q=` parsing, `#access_token` ignored, push/replace |
| Route matching & params | `tests/hashRouter.test.tsx` | static / `:param` / order / fallback / decode |
| Role derivation | `tests/roles.test.ts` | all 4 roles + business-route matrix |
| Nav role filtering | `tests/navigation.test.tsx` | Sidebar / drawer / bottom-nav per role |
| Mobile drawer behaviour | `tests/navigation.test.tsx` | open/close / overlay / scroll-lock |
| Lock screen CTAs | `tests/navigation.test.tsx` | per-role RestrictedView actions |
| Order API hardening | `tests/api-routes.test.ts` | every invalid-input 400, RPC 201/409 |
| API response shapes | `tests/api-routes.test.ts` | snake→camel mapping, filters, slug 404 |
| Trial state machine | `tests/trial.test.tsx` | all phases, countdown math, time formats |
| Trial gate UI | `tests/trial.test.tsx` | banner/lock per phase + role, request-approval call |
| Order soft-delete rule | `tests/order-rules.test.ts` | DELETE = status update, no hard-delete path |
| Revenue exclusion | `tests/order-rules.test.ts` | deleted/cancelled/refunded never summed |
| Receipt QR | `tests/receipt-qr.test.tsx` | encodes `/#/orders/:id` URL, prints, fails soft |

---

## Quick smoke test (5 min, after every deploy)

Run this before anything else if time is short:

1. Open `http://localhost:3000` → Explore loads with products
2. Click a product → detail page; scroll down → "Add to Cart" visible above nav
3. Add to cart → cart badge increments
4. Navigate to `#/checkout` → order summary shows
5. Sign in as consumer → profile shows user name
6. Sign out → back to guest UI
7. Sign in as business → POS appears in bottom nav; `#/dashboard` opens
8. **Landscape orientation** → bottom nav stays visible (fixed, not scrolled away)
9. Mobile drawer (hamburger) → opens, links work, closes on tap
10. Sign out

If any of these 10 steps fail, stop and investigate before running the full plan.
