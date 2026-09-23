import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant-client";
import { resolveEntitlement } from "@/server/auth/entitlement";
import { DraftError } from "./errors";
import { recordPick } from "./record-pick";
import { computeTotalPicks } from "./draft-math";
import { blocChamberFilter, type ChamberScope } from "../leagues/chamber-scope";

/**
 * "Best available" auto-pick rule (SRD B2): lowest Bloc.draftRank among
 * blocs in the league's taxonomy that are (a) unclaimed this season and
 * (b) entitlement-eligible for the picking owner. draftRank is a seeded
 * PLACEHOLDER (see prisma/schema.prisma's Bloc.draftRank comment) — the
 * SRD only specifies "a default/best-available rule" without defining
 * ranking criteria; this needs real product input before launch.
 */
async function pickBestAvailableBloc(
  tenantId: string,
  taxonomyId: string,
  chamberScope: ChamberScope,
  seasonId: string,
  ownerUserId: string
): Promise<string | null> {
  const taken = await withTenant(tenantId, (tx) =>
    tx.rosterBloc.findMany({ where: { seasonId }, select: { blocId: true } })
  );
  const entitlement = await resolveEntitlement(ownerUserId, tenantId);
  const chamberFilter = await blocChamberFilter(prisma, chamberScope);

  const candidates = await prisma.bloc.findMany({
    where: {
      taxonomyId,
      ...chamberFilter,
      id: { notIn: taken.map((t) => t.blocId) },
      ...(entitlement.tier === "paid" ? {} : { isPaidTier: false }),
    },
    orderBy: { draftRank: "asc" },
    take: 1,
  });

  return candidates[0]?.id ?? null;
}

/**
 * Resolves every pick on a draft that's ready for auto-pick, oldest first
 * — either because it's genuinely overdue, OR because the current picker
 * is a bot (User.isBot — see that field's comment), which never waits out
 * its timer at all. Called three ways (SRD B2's fallback, without any
 * persistent worker — see the architecture plan §5/§8):
 *   1. Lazily, at the top of every draft-state read/pick submission — see
 *      ./get-draft-state.ts and ./submit-pick.ts. This is also what makes
 *      bot turns resolve "instantly" in practice: the next read/submit
 *      after a human's pick advances the turn to a bot picks it up here.
 *   2. By the /api/jobs/draft-sweep route on an external cron schedule, so
 *      a draft still advances even if nobody is actively polling it.
 *
 * Loops (each iteration in its own transaction, re-reading fresh state)
 * because more than one pick can be ready at once — e.g. several
 * consecutive bots in the pick order, or a 24h pick timer plus an hourly
 * sweep leaving multiple overdue human picks.
 */
export async function resolveExpiredPicks(tenantId: string, draftEventId: string): Promise<number> {
  let resolvedCount = 0;

  for (let i = 0; i < 500; i++) {
    const resolvedOne = await withTenant(tenantId, async (tx) => {
      const draftEvent = await tx.draftEvent.findUniqueOrThrow({
        where: { id: draftEventId },
        include: { season: { include: { league: true } } },
      });

      if (draftEvent.status !== "in_progress") return false;
      if (!draftEvent.currentPickerUserId) return false;

      const picker = await tx.user.findUnique({ where: { id: draftEvent.currentPickerUserId }, select: { isBot: true } });
      const deadlinePassed = Boolean(draftEvent.currentPickDeadlineAt && draftEvent.currentPickDeadlineAt <= new Date());
      if (!picker?.isBot && !deadlinePassed) return false;

      const pickOrder = draftEvent.pickOrder as string[];
      const totalPicks = await computeTotalPicks(tx, draftEvent.seasonId, draftEvent.season.league.rosterSize, pickOrder.length);

      const roster = await tx.roster.findUniqueOrThrow({
        where: {
          seasonId_ownerUserId: { seasonId: draftEvent.seasonId, ownerUserId: draftEvent.currentPickerUserId },
        },
      });

      const blocId = await pickBestAvailableBloc(
        tenantId,
        draftEvent.season.league.blocTaxonomyId,
        draftEvent.season.league.chamberScope,
        draftEvent.seasonId,
        draftEvent.currentPickerUserId
      );
      if (!blocId) {
        throw new DraftError(
          "No eligible blocs remain for auto-pick — league configuration error (should have been caught at draft start)"
        );
      }

      await recordPick(tx, draftEvent, totalPicks, roster.id, draftEvent.currentPickerUserId, blocId, true);
      return true;
    });

    if (!resolvedOne) break;
    resolvedCount++;
  }

  return resolvedCount;
}
