# Mogarenta — MVP

> The smallest version of the product that a real customer and a real store can use end-to-end, and the honest list of what is deliberately left for later.
> Last updated: 2026-07-05

---

## 1. MVP goal (one sentence)

**A shopper in Mogadishu searches for a product, sees the 10 closest stores that sell it, orders for pickup or delivery, and pays by mobile wallet — while any shop owner can open a store, stock it in one afternoon by claiming catalog products, and get paid.**

## 2. What is IN the MVP — and already built ✅

### Shopping (customer side)
- Explore page: shared catalog with categories, subcategory chips, best sellers, store district on every card ("📍 Hodan").
- Search: products AND stores by name; **nearby offers** — every store selling a match (original uploader + claimed copies), ranked by live GPS distance, each at its own price.
- Product detail: photo carousel, store info, similar products (same tags → same name words → same category).
- Cart grouped **per shop**, checkout scoped to one shop at a time.
- Pickup or delivery (Mogadishu district dropdown), Sifalo wallet payment on-page, order tracking.
- Wishlist (synced to account), notifications, in-app chat with stores, PWA install ("add to home screen"), offline banner.

### Selling (business side)
- Signup → automatic store link (`/store-name`) → trial period → admin approval flow.
- Profile setup: logo upload or emoji, one-tap GPS location, claimable custom store link with live availability check, contact numbers, bio.
- **Claim model:** one tap adds any catalog product to the store; owner sets own price/stock in Inventory. New products can also be created (with AI-written Somali descriptions) or bulk-imported via CSV.
- Inventory with price/stock/MOQ editing; barcode scanner.
- **POS:** counter sales with cashier accounts and per-cashier privileges; sellers cannot buy their own products.
- Orders dashboard (server-authoritative pricing), coupons, reviews.
- Wallet: server-computed Sifalo balance, saved payout number, payout ledger.

### Wholesale & agents
- B2B products (visible to businesses only), tier pricing, minimum order quantities.
- Field-agent profile: registrations, stores reached, commission tiers.

### Platform
- Admin panel (users, approvals, verification requests, stats) — the only fully auth-guarded API area.
- Help chatbot (Gemini), Somali product-description writer.
- Performance: ETag polling, incremental grids, cached catalog, lazy routes.

## 3. What is OUT of the MVP — deliberately later ⏳

| Feature | Why it waits | Trigger to build it |
|---|---|---|
| API auth on all endpoints | Biggest pre-launch task; admin routes done, rest open | **Before first real payment** |
| Live Sifalo payments | Code ready in mock mode | When merchant credentials arrive |
| WaafiPay direct integration | Cuts fees ~2-3 % → ~1 % | After Sifalo proves the flow |
| Phone OTP (WhatsApp-based) | Email login works today | When fake signups become a problem |
| True subdomains (`store.mogarenta.com`) | Path links (`/store-name`) work everywhere incl. localhost | After domain purchase, if wanted |
| Delivery driver tracking | Manual status updates suffice at low volume | When order volume needs it |
| Field-agent full store delegation | Plan agreed, not built | When agents manage stores day-to-day |
| Paid Gemini tier / rate limiting | Free tier fine at current traffic | When AI features hit limits |

## 4. Launch checklist (in order)

1. ☐ Put the code in git + GitHub.
2. ☐ Create Vercel project, set env vars, deploy.
3. ☐ Buy domain, point it at Vercel.
4. ☐ Upgrade Supabase to Pro (backups!), run `migration_payouts.sql`.
5. ☐ **Close the open API endpoints** (auth on writes, rate limiting).
6. ☐ Turn on email confirmation + custom SMTP.
7. ☐ Enter Sifalo live credentials; do one real end-to-end paid order.
8. ☐ Add Sentry + uptime monitor.
9. ☐ Onboard 5–10 pilot stores; each one: logo, GPS tap, store link claimed, ≥20 products.
10. ☐ Soft launch in one district; watch orders daily.

## 5. MVP success metrics

| Metric | Target (first 90 days) |
|---|---|
| Active stores (≥1 order/week) | 25 |
| Orders per week | 100 |
| Search → order conversion | ≥ 5 % |
| Stores with GPS + logo + link set | ≥ 80 % of active |
| Order disputes / failed payments | < 2 % |
| Page load (repeat visit, mid-range phone) | < 2 s to content |
