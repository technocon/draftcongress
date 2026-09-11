import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

/**
 * A Prisma client scoped to a single tenant for the duration of one
 * transaction. All tenant-scoped model queries (League, Season, Roster,
 * RosterBloc, DraftEvent, DraftPick, LeagueMembership, TenantMembership,
 * TenantEntitlement, AuditLog) MUST go through this — never the raw
 * `prisma` singleton — or Postgres RLS has nothing to scope against and
 * every query returns zero rows (fail-closed) or, worse, whatever the
 * connection's leftover session state happens to be.
 */
export type TenantScopedClient = Prisma.TransactionClient;

/**
 * Runs `fn` inside a transaction with `app.current_tenant_id` set via
 * `SET LOCAL` (via `set_config(..., true)`), so the RLS policies in
 * prisma/rls/003_policies.sql scope every query inside `fn` to `tenantId`.
 *
 * Using `SET LOCAL` (transaction-scoped, not session-scoped) inside an
 * explicit `$transaction` is required, not optional: Neon's pooled
 * connection string runs PgBouncer in transaction-pooling mode, so a bare
 * `SET app.current_tenant_id = ...` on a pooled connection can leak across
 * unrelated requests that happen to reuse the same underlying connection.
 * `SET LOCAL` inside a transaction is automatically reset when the
 * transaction ends, which is exactly the guarantee we need.
 *
 * @example
 *   const leagues = await withTenant(tenantId, (tx) => tx.league.findMany());
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantScopedClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error("withTenant() requires a non-empty tenantId");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
