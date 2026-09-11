import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Runtime client — connects as `app_runtime` (DATABASE_URL, no BYPASSRLS).
 *
 * RLS-enabled tables (every tenant-scoped table — see prisma/rls/) return
 * zero rows through this client unless the current transaction has set
 * `app.current_tenant_id`. Use `withTenant()` from `./tenant-client` for
 * any query touching a tenant-scoped model.
 *
 * Reference tables (LegislativeBody, Chamber, Legislator, Bloc,
 * BlocMembership, ScoringRule, ScoringEvent — no RLS policy at all) are
 * safe to query directly through this client with no tenant context.
 */
export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

/**
 * Admin client — connects as `app_migrator` (BYPASSRLS) via
 * DIRECT_DATABASE_URL.
 *
 * ONLY for `prisma/seed.ts` and one-off platform-admin scripts that must
 * write tenant-scoped rows outside of any tenant context (e.g. seeding the
 * first Tenant row itself, or genuinely cross-tenant platform tooling).
 *
 * Never import this inside `src/app/**` or `src/server/domain/**` — request
 * handling must always go through `withTenant()` so isolation is enforced
 * by Postgres, not by code review.
 */
export function createAdminClient(): PrismaClient {
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) {
    throw new Error(
      "DIRECT_DATABASE_URL is required to create an admin (BYPASSRLS) Prisma client"
    );
  }
  return new PrismaClient({ datasources: { db: { url } } });
}
