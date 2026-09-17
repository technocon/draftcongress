# Draft Congress

Fantasy sports mechanics, applied to legislative blocs. Full product context is in the SRD at
`../SRD_Multi_Tenant_Fantasy_Politics.md`; the architecture decisions behind this codebase are in the plan this was
built from (ask whoever ran the build for the plan file, or see the commit history — each commit maps to one
milestone).

## Stack

Next.js (TypeScript, App Router) · PostgreSQL via Prisma · Auth.js (Google + email/password) · Stripe · Postgres
row-level security for tenant isolation · Neon for managed Postgres in production · Hostinger Node.js hosting (not a
VPS — no Docker in production) for the app itself.

## First-time local setup

Requires Docker (for a local Postgres only — the app itself runs on the host, not in a container) and Node 20+.

```bash
# 1. Install dependencies
npm install

# 2. Start local Postgres (+ adminer at http://localhost:8081)
docker compose -f docker/docker-compose.yml up -d db

# 3. Copy env and fill in anything you need (defaults work for local dev as-is)
cp .env.example .env

# 4. Create the app_migrator / app_runtime roles this project's RLS model depends on
#    (run once per fresh database — uses the Postgres superuser)
docker exec -i draft-congress-dev-db-1 psql -U postgres -d draft_congress < prisma/rls/001_roles.sql

# 5. Local dev only: app_migrator needs CREATEDB to build Prisma Migrate's shadow database.
#    (Not needed/wanted in production — `prisma migrate deploy` there doesn't use a shadow DB.)
docker exec draft-congress-dev-db-1 psql -U postgres -d draft_congress -c "ALTER ROLE app_migrator CREATEDB;"

# 6. Run migrations (creates all tables)
npm run db:migrate

# 7. Enable RLS + apply tenant-isolation policies (see prisma/rls/ — deliberately NOT
#    part of Prisma's migration history; re-run 003 after schema changes that touch
#    tenant-scoped tables)
docker exec -i draft-congress-dev-db-1 psql -U postgres -d draft_congress < prisma/rls/002_enable_rls.sql
docker exec -i draft-congress-dev-db-1 psql -U postgres -d draft_congress < prisma/rls/003_policies.sql

# 8. Seed reference data (US House/Senate, free/paid taxonomies, a handful of illustrative
#    blocs/legislators, PLACEHOLDER scoring rules, the public tenant)
npm run db:seed

# 9. Run it
npm run dev
```

Then open http://localhost:3000 (or whatever port you ran `next dev` on).

## Common commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build (standalone output — see next.config.ts) |
| `npm test` | Runs the test suite once (RLS isolation, scoring ingestion, full draft-engine flow) |
| `npm run test:watch` | Same, in watch mode |
| `npm run db:migrate` | `prisma migrate dev` — new/updated migrations |
| `npm run db:migrate:deploy` | `prisma migrate deploy` — apply existing migrations (prod/CI) |
| `npm run db:seed` | Re-run the (idempotent) reference-data seed |
| `npm run db:studio` | Prisma Studio against your local DB |
| `npm run db:import-congress-members` | Pull real current members from congress.gov into Legislator/Race (needs `CONGRESS_GOV_API_KEY`; fixture data otherwise) |
| `npx tsx scripts/generate-district-boundaries.ts <shp>` | Regenerate `public/district-boundaries/*.json` (real House district shapes) from a Census cartographic boundary shapefile — see the script's own header comment for the download URL and full usage. Only needs re-running after redistricting. |

## Architecture notes worth knowing before you touch this

- **Tenant isolation is enforced by Postgres, not application code.** Every tenant-scoped model must be queried
  through `withTenant()` (`src/server/db/tenant-client.ts`), never the raw `prisma` singleton — RLS policies
  (`prisma/rls/003_policies.sql`) silently return zero rows otherwise (or reject writes). The RLS isolation test
  (`tests/rls/tenant-isolation.test.ts`) actually caught a real Postgres gotcha this way once already: read that
  test's comments before assuming `current_setting()` behaves the way you'd expect on a reused connection.
- **Two DB roles**: `app_migrator` (owns the schema, BYPASSRLS — `DIRECT_DATABASE_URL`, used by Prisma Migrate and
  `prisma/seed.ts` only) and `app_runtime` (the app itself — `DATABASE_URL`, full RLS enforcement, no bypass).
- **Reference data vs. tenant data**: `LegislativeBody`, `Chamber`, `Legislator`, `Bloc`, `BlocMembership`,
  `ScoringRule`, `ScoringEvent` carry no `tenant_id` and no RLS — they're objective facts shared across every
  tenant. `BlocTaxonomy` and `ScoringConfig` are the documented exception: nullable `tenant_id`, `null` = platform
  default. Everything else tenant-scoped (`League`, `Season`, `Roster`, `RosterBloc`, `DraftEvent`, `DraftPick`,
  `TenantMembership`, `LeagueMembership`, `TenantEntitlement`, `AuditLog`) carries `tenant_id NOT NULL`.
- **No Docker, no websockets in production.** Hostinger's Node.js hosting is a managed single-process runtime, not a
  VPS — see `scripts/deploy.sh` and the "Deploying" section below. The draft board polls (`src/components/
  auto-refresh.tsx`) instead of using push, and overdue picks resolve lazily on read
  (`src/server/domain/drafts/auto-pick.ts`) plus via a cron-hit sweep endpoint, rather than a background worker.
- **Real data adapters exist but are inert without API keys.** `src/server/adapters/legislative` and
  `.../electoral` fall back to fixture-backed implementations (`tests/fixtures`-equivalent JSON under each
  adapter's `fixtures/data/`) unless `CONGRESS_GOV_API_KEY` / `FEC_API_KEY` are set — see each adapter's docstring
  for what's verified vs. best-effort. The FEC adapter's `fetchRaceResults` deliberately throws rather than
  fabricating general-election win/loss data it can't actually source (SRD open question #3, still unresolved).
- **PLACEHOLDER data**: `prisma/seed.ts`'s `ScoringRule` point values and the illustrative legislators/blocs it
  seeds are explicitly not real — labeled as such in the file. Don't ship these to a public launch as-is.

## Environment variables

See `.env.example` for the full list with explanations. The ones that matter most:

- `DATABASE_URL` / `DIRECT_DATABASE_URL` — pooled (app_runtime) / direct (app_migrator) Postgres connections. In
  production, both point at Neon; `DATABASE_URL` uses Neon's pooled connection string.
- `NEXTAUTH_URL` — **must match whatever origin the app is actually served from**, including the port in local dev.
  A mismatch here silently sends post-login redirects to the wrong place (this bit us once during development: it
  redirected to an unrelated project running on port 3000 because `.env` still said 3000 while the dev server had
  been started on 3100 — check this first if sign-in redirects somewhere unexpected).
- `CRON_SHARED_SECRET` — required in an `x-cron-secret` header by every `/api/jobs/*` route; set this as the header
  value in Hostinger's hPanel Cron Jobs config.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PAID_TIER_PRICE_ID` — leave unset to run with billing
  disabled (the billing page detects this and says so rather than erroring).

## Deploying (Hostinger Node.js hosting)

This targets hPanel's Node.js app manager — a managed single-process runtime, not a VPS. There's no Docker step in
production.

1. Build locally to sanity-check: `npm run build` (uses `output: "standalone"` — see `next.config.ts`).
2. On the server (SSH): `git pull`, then run `scripts/deploy.sh`, which does `npm ci --omit=dev && npm run build`
   and triggers a restart. Confirm the exact restart mechanism in hPanel once the app exists there — it varies by
   plan (a touched restart file vs. an hPanel API/button call) and `scripts/deploy.sh` has a placeholder for it.
3. Point hPanel's Node app manager at the standalone output's `server.js` as the startup file.
4. Set every var from `.env.example` in hPanel's environment-variable UI — nothing is read from a checked-in `.env`
   in production.
5. Configure hPanel's Cron Jobs feature to POST (with the `x-cron-secret` header) to:
   - `/api/jobs/ingest-legislative` and `/api/jobs/ingest-electoral` — on whatever cadence real data licensing ends
     up requiring (SRD §10 — not yet confirmed).
   - `/api/jobs/draft-sweep` — every 30–60s, so overdue draft picks resolve even without anyone actively viewing a
     draft board.
6. Point `DATABASE_URL` at Neon's **pooled** connection string and `DIRECT_DATABASE_URL` at Neon's **direct**
   (unpooled) one — Prisma Migrate and DDL don't play well with transaction-mode pooling, and
   `src/server/db/tenant-client.ts`'s `SET LOCAL`-in-transaction pattern specifically depends on getting this
   split right.
7. Run `prisma/rls/001_roles.sql`, `002_enable_rls.sql`, and `003_policies.sql` against the Neon database (via
   Neon's SQL editor or `psql`) — these are NOT part of Prisma's migration history, so `prisma migrate deploy`
   alone will create tables without RLS enabled. Do this once per fresh database, and re-run `003` after any schema
   change that adds a tenant-scoped table or changes tenant-scoping.

## Testing

`npm test` runs three suites against your local dev database (no mocking — see `tests/rls`, `tests/integration`):
tenant RLS isolation (including the fail-closed-on-reused-connection case), the fixture-driven scoring ingestion
pipeline end to end, and a full async draft (league → season → draft → picks → completion → standings, plus
rejection cases for out-of-turn picks, missing entitlement, and an over-subscribed roster size).
