import { createAdminClient } from "@/server/db/client";
import { writeAuditLogAsPlatform } from "@/server/domain/audit/log";

/**
 * Epic G1: "Operators can update bloc composition (member lists) ...
 * without a code deploy." This is the domain function that satisfies
 * that — there's no admin UI for it yet (out of scope for this build),
 * but the operation and its audit trail are real and callable (e.g. from
 * a one-off script, or a future admin page).
 *
 * Runs via the admin (BYPASSRLS) client because bloc composition is
 * platform-level reference data, not scoped to any one tenant — see
 * prisma/schema.prisma's "Reference/content data" section.
 *
 * This is also where an ingestion-detected membership change (e.g. a seat
 * flip implying a caucus gained/lost a member) is meant to land once that
 * review-queue flow is built — see
 * src/server/adapters/legislative/index.ts and ingest.ts's comments. That
 * queue isn't implemented yet; today this is operator-invoked only.
 */
export async function endBlocMembership(membershipId: string, endDate: Date, actorUserId?: string) {
  const admin = createAdminClient();
  const before = await admin.blocMembership.findUniqueOrThrow({ where: { id: membershipId } });
  const after = await admin.blocMembership.update({ where: { id: membershipId }, data: { endDate } });

  await writeAuditLogAsPlatform(admin, {
    actorUserId: actorUserId ?? null,
    action: "bloc_membership.ended",
    entityType: "BlocMembership",
    entityId: membershipId,
    before: { endDate: before.endDate },
    after: { endDate: after.endDate },
    source: "operator",
  });

  await admin.$disconnect();
  return after;
}

export async function createBlocMembership(
  input: { blocId: string; legislatorId: string; startDate: Date },
  actorUserId?: string
) {
  const admin = createAdminClient();
  const membership = await admin.blocMembership.create({ data: input });

  await writeAuditLogAsPlatform(admin, {
    actorUserId: actorUserId ?? null,
    action: "bloc_membership.created",
    entityType: "BlocMembership",
    entityId: membership.id,
    after: input,
    source: "operator",
  });

  await admin.$disconnect();
  return membership;
}
