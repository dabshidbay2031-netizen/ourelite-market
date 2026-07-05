# Mogarenta

A local marketplace + Point-of-Sale platform for Somalia & East Africa. Next.js (App Router) SPA over a Supabase (Postgres) backend, with a claim-model catalog, per-business dashboards, an in-store POS, Sifalo Pay checkout, and Gemini/OpenRouter AI features.

## Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript. Hash-routed SPA — every screen lives under `/#/…` via `lib/hashRouter`; `app/[[...slug]]/page.tsx` is the only page route.
- **Backend:** Next.js Route Handlers in `app/api/**` on the Supabase **service-role** client. Authorization is enforced in-route via `lib/apiAuth` (JWT bearer → `getAuthUser` / `requireStaff` / `requireAdmin` / ownership checks).
- **DB:** Supabase Postgres. Canonical schema: `supabase/schema_v3.sql`; incremental changes as `supabase/migration_v3_*.sql`.
- **Payments:** Sifalo Pay (`lib/payments/sifalo`) — Somali wallets (EVC/ZAAD/SAHAL, eDahab, Premier).
- **AI:** `lib/ai` — provider-agnostic (OpenRouter preferred, Gemini fallback). Somali product-description writer + public help assistant.

## Getting started

```bash
cd mogarenta-next
npm install
cp .env.local.example .env.local   # then fill in the keys below
npm run dev                         # http://localhost:3001
```

### Environment (`.env.local`)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side API routes |
| `OPENROUTER_API_KEY` (+ `OPENROUTER_MODEL`) | AI features — see `.env.openrouter.example` |
| `SIFALO_API_USERNAME` / `SIFALO_API_PASSWORD` | Sifalo Pay — see `.env.sifalo.example` |

## Scripts

```bash
npm run dev          # dev server (port 3001)
npm run build        # production build
npx tsc --noEmit     # type-check
npx vitest run       # test suite
```

## Layout

```
app/            # Next.js routes: the SPA shell + app/api/** route handlers
views/          # Screen components (rendered by the hash router)
components/     # Shared UI
context/        # Auth / App / Cashier / I18n providers
lib/            # hashRouter, apiAuth, payments, ai, roles, helpers
supabase/       # schema_v3.sql + migrations
tests/          # Vitest suites
```

## Security notes

- Every `app/api/**` handler runs with the service-role key, so **each route is responsible for its own authorization** (there is no global middleware). Reads that expose per-user or per-store data must check ownership (`ownsStoreOrAdmin`, self-checks); mutations gate on `requireStaff`/`requireAdmin`.
- Public POST endpoints (orders, AI, payments, cashier login) are IP rate-limited via `lib/rateLimit`.
