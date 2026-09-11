import type { Prisma } from "@prisma/client";
import type { TenantScopedClient } from "@/server/db/tenant-client";

/**
 * Epic G2: "Every scoring event and bloc-composition change is logged with
 * source, timestamp, and (where applicable) the operator who made a
 * manual change." ScoringEvent rows already carry source+timestamp
 * inherently (see src/server/domain/scoring/ingest.ts); this covers the
 * other cases — tenant-scoped operational actions (draft picks) and
 * platform-level content changes (bloc composition).
 *
 * Takes a tenant-scoped transaction client so a tenant-scoped audit entry
 * (tenant_id NOT NULL from the caller's perspective) is written in the
 * SAME transaction as the action it's logging — an audit entry that lost
 * a race with its own subject action would be worse than not logging at
 * all. For platform-level entries (tenant_id null — e.g. an operator
 * editing bloc composition, which isn't scoped to any one tenant), use
 * writeAuditLogAsPlatform below.
 */
export async function writeAuditLog(
  tx: TenantScopedClient,
  entry: {
    tenantId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
    source: string;
  }
) {
  await tx.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.before ?? undefined,
      afterJson: entry.after ?? undefined,
      source: entry.source,
    },
  });
}

/**
 * Platform-level audit entries (tenant_id null) can only be written via
 * the admin/bypass-RLS client — see prisma/rls/003_policies.sql's comment
 * on audit_logs for why there's deliberately no "tenant_id IS NULL" RLS
 * exception here.
 */
export async function writeAuditLogAsPlatform(
  admin: Prisma.TransactionClient,
  entry: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
    source: string;
  }
) {
  await admin.auditLog.create({
    data: {
      tenantId: null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.before ?? undefined,
      afterJson: entry.after ?? undefined,
      source: entry.source,
    },
  });
}
