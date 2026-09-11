import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant-client";
import { requireEntitlement } from "@/server/auth/entitlement";
import { DraftError } from "./errors";
import { recordPick } from "./record-pick";
import { resolveExpiredPicks } from "./auto-pick";
import { computeTotalPicks } from "./draft-math";

/**
 * User-submitted draft pick (SRD B1). See the architecture plan §5 for the
 * transactional steps this implements: verify turn, verify deadline,
 * verify entitlement for a paid-tier bloc, insert, advance clock.
 */
export async function submitDraftPick(tenantId: string, userId: string, draftEventId: string, blocId: string) {
  // Resolve any picks that went overdue before this one arrived — it may
  // no longer be `userId`'s turn by the time this runs.
  await resolveExpiredPicks(tenantId, draftEventId);

  return withTenant(tenantId, async (tx) => {
    const draftEvent = await tx.draftEvent.findUniqueOrThrow({
      where: { id: draftEventId },
      include: { season: { include: { league: true } } },
    });

    if (draftEvent.status !== "in_progress") {
      throw new DraftError("Draft is not in progress");
    }
    if (draftEvent.currentPickerUserId !== userId) {
      throw new DraftError("It is not your turn to pick");
    }
    if (draftEvent.currentPickDeadlineAt && draftEvent.currentPickDeadlineAt < new Date()) {
      throw new DraftError("Your pick window just expired — refresh to see the auto-pick result");
    }

    const bloc = await prisma.bloc.findUnique({ where: { id: blocId } });
    if (!bloc) throw new DraftError("Bloc not found");
    if (bloc.taxonomyId !== draftEvent.season.league.blocTaxonomyId) {
      throw new DraftError("This bloc is not part of the league's draft pool");
    }
    // B4: free-tier leagues only see chamber/leadership blocs; paid-tier
    // blocs require the picking user's OWN entitlement, re-resolved here
    // rather than trusted from a session token (see entitlement.ts).
    if (bloc.isPaidTier) {
      await requireEntitlement(userId, tenantId, "paid");
    }

    const roster = await tx.roster.findUniqueOrThrow({
      where: { seasonId_ownerUserId: { seasonId: draftEvent.seasonId, ownerUserId: userId } },
    });

    const pickOrder = draftEvent.pickOrder as string[];
    const totalPicks = await computeTotalPicks(tx, draftEvent.seasonId, draftEvent.season.league.rosterSize, pickOrder.length);

    return recordPick(tx, draftEvent, totalPicks, roster.id, userId, blocId, false);
  });
}
