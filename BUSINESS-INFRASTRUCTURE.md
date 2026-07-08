# Mogarenta — Business Infrastructure

> What runs the platform, what it costs, and what is still needed to operate it as a real business.
> Last updated: 2026-07-05

---

## 1. What Mogarenta is

Mogarenta is an e-commerce marketplace + point-of-sale platform built for Mogadishu:

- **Customers** browse a shared catalog, see which stores near them sell a product (live GPS distance, district names), order for pickup or delivery, and pay by mobile wallet.
- **Businesses** open a store in minutes, copy ("claim") products from the shared catalog with one tap, set their own price and stock, sell online and over the counter (POS), and withdraw earnings.
- **Wholesale suppliers** list B2B products with tier pricing and minimum order quantities.
- **Field agents** register businesses on the ground and earn commission.

## 2. Technical architecture

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 16 + React 18, single-page app with hash routing (`/#/...`) | One catch-all page; clean store URLs (`/store-name`) served by the shell |
| Hosting | Vercel (config ready in `vercel.json`) | Region `iad1`, API max duration 30 s |
| Database | Supabase Postgres (project `knnrmdkzoicjuuaaownb`) | Canonical schema: `supabase/schema_v3.sql` |
| Auth | Supabase Auth (email + OAuth callback wired) | Email confirmation currently OFF |
| File storage | Supabase Storage (`product-images` bucket) | Product photos + store logos |
| Payments | Sifalo Pay gateway (`lib/payments/sifalo`) | Mock mode until live credentials are set |
| AI | Google Gemini (free tier) | Somali product-description writer + public help chatbot |
| Analytics | Plausible (domain var set, account needed) | Privacy-friendly, no cookies |

### Performance layer (already built)
- ETag/304 polling — live refresh re-downloads nothing when data is unchanged.
- Incremental grids — Explore/Search render 24 products per page scroll, not 700 at once.
- localStorage catalog cache — repeat visits paint instantly.
- Lazy-loaded routes — each page's code downloads only when first visited.

### Location layer (already built)
- Stores set GPS with one tap ("Detect my location" in Profile).
- Coordinates are recognised into one of Mogadishu's 17 districts (`lib/districts.ts`).
- Search ranks offers by live distance from the shopper (top 10 closest stores).

## 3. Environment variables

Set in `.env.local` locally, and in the Vercel dashboard for production:

| Variable | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client DB access | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side API routes (keep secret!) | ✅ set |
| `GEMINI_API_KEY` | AI description writer + chatbot | ✅ set (free tier) |
| `SIFALO_API_USERNAME` / `SIFALO_API_PASSWORD` | Live wallet payments | ⏳ mock until real merchant creds |
| `NEXT_PUBLIC_ADMIN_UIDS` | Platform admin accounts | ✅ set |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Analytics | ⏳ needs Plausible account |

## 4. Database operations

- **Fresh install:** run `supabase/schema_v3.sql` only.
- **Pending on the live DB:** `supabase/migration_payouts.sql` (enables payout-ledger writes).
- **Seed/maintenance scripts** (`scripts/`): demo accounts & activity, store locations (`seed-store-locations.mjs`), store links (`backfill-store-slugs.mjs`), sequence repair (`fix-bp-sequence.sql`).
- **Backups:** none on the free tier — this is the single biggest operational risk (see §6).

## 5. Money flow

1. Customer pays at checkout via Sifalo (charged on-page, no redirect) or cash on pickup/delivery.
2. Online payments accumulate as the store's wallet balance (computed server-side on the business dashboard).
3. Store owner saves a payout number and requests withdrawal; payouts are recorded in a ledger that deducts exact amounts.
4. POS (counter) sales are recorded per cashier session for end-of-day reconciliation.

**Fees to plan for:** Sifalo ≈ 2–3 % per transaction today. Going direct to WaafiPay (EVC Plus/Zaad/Sahal) later cuts this to ≈ 1 % — the checkout already defaults to the Waafi method label, so it is the intended path.

## 6. What the business still needs to buy / set up

Priority order:

| # | Item | Why | Cost |
|---|---|---|---|
| 1 | Git repository + GitHub | The code has no version control today — no history, no safe deploys | Free |
| 2 | Vercel project | Production hosting; copy env vars into the dashboard | Free → $20/mo |
| 3 | Domain (e.g. mogarenta.com) | Store links become real business cards: `mogarenta.com/store-name` | ~$12/yr |
| 4 | Supabase Pro | Free tier pauses after inactivity and has **no backups** — unacceptable with real orders | $25/mo |
| 5 | API security work | Only `/api/admin/*` is protected; all other endpoints are open. Must be closed before real money flows | Dev work |
| 6 | Sifalo merchant account | Switches checkout from mock to live (no code change) | Per-transaction fee |
| 7 | SMTP provider (e.g. Resend) + turn ON email confirmation | Real signup emails; blocks fake accounts | Free tier |
| 8 | Sentry + UptimeRobot | Know about errors before customers complain | Free tiers |
| 9 | Plausible (optional) | Traffic analytics | ~$9/mo |

**Estimated running cost at launch: ~$25–55/month** plus payment-gateway fees.

## 7. Known operational issues

- **Dev server EPERM lock (Windows):** two `next dev` instances sharing `.next` → blank page. Fix: kill stale `node.exe`, delete `.next`, restart.
- **Broken product image URLs** render the placeholder (handled), but old seeded URLs should be cleaned up eventually.
- **Gemini free tier** will rate-limit under load; budget for the paid tier as AI usage grows.
