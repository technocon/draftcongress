import { withTenant } from "@/server/db/tenant-client";
import { prisma } from "@/server/db/client";
import { DraftError } from "./errors";
import { shuffle } from "./pick-order";
import { computeTotalPicks } from "./draft-math";
import { blocChamberFilter } from "../leagues/chamber-scope";

const DEFAULT_PICK_TIME_LIMIT_SECONDS = 24 * 60 * 60; // 24h — league-configurable later

/**
 * Starts the (async-only, per decision #6) draft for a season already in
 * pre_draft with rosters created (see ../leagues/start-season.ts).
 *
 * Validates rosterSize × ownerCount ≤ available blocs in the league's
 * taxonomy BEFORE starting — the concrete default for SRD open question
 * #5 (league size / bloc scarcity), per the architecture plan §5.
 */
export async function startDraft(tenantId: string, seasonId: string) {
  return withTenant(tenantId, async (tx) => {
    const season = await tx.season.findUniqueOrThrow({
      where: { id: seasonId },
      include: { league: true, rosters: true, draftEvent: true },
    });

    if (season.status !== "pre_draft") {
      throw new DraftError(`Season is not in pre_draft status (currently: ${season.status})`);
    }
    if (season.draftEvent) {
      throw new DraftError("Draft already started for this season");
    }
    if (season.league.draftFormat !== "async") {
      throw new DraftError(
        `Only the async draft format is implemented in Phase 1 (league is configured for "${season.league.draftFormat}")`
      );
    }

    // Total blocs in the taxonomy (narrowed by the league's chamber scope,
    // if any — see chamber-scope.ts), minus any this season already
    // carried over via a keeper policy (start-season.ts) — those are
    // unavailable to draft again, they're already owned.
    const chamberFilter = await blocChamberFilter(prisma, season.league.chamberScope);
    const taxonomyBlocCount = await prisma.bloc.count({
      where: { taxonomyId: season.league.blocTaxonomyId, ...chamberFilter },
    });
    const keptCount = await tx.rosterBloc.count({ where: { seasonId, draftPickId: null } });
    const availableBlocs = taxonomyBlocCount - keptCount;

    const totalPicks = await computeTotalPicks(tx, seasonId, season.league.rosterSize, season.rosters.length);
    if (totalPicks > availableBlocs) {
      throw new DraftError(
        `Not enough blocs for this league: ${season.rosters.length} owners x ${season.league.rosterSize} roster size ` +
          `= ${totalPicks} picks still needed (after ${keptCount} kept blocs), but only ${availableBlocs} blocs remain available in this taxonomy.`
      );
    }

    const pickOrder = shuffle(season.rosters.map((r) => r.ownerUserId));
    const now = new Date();
    // A fully-kept roster (rare — every slot already carried over) needs
    // zero new picks: create the event already complete rather than
    // leaving it "in_progress" with nothing left to pick.
    const startsComplete = totalPicks <= 0;

    const draftEvent = await tx.draftEvent.create({
      data: {
        tenantId,
        seasonId,
        format: "async",
        status: startsComplete ? "complete" : "in_progress",
        pickOrder,
        pickTimeLimitSeconds: DEFAULT_PICK_TIME_LIMIT_SECONDS,
        currentPickIndex: 0,
        currentPickerUserId: startsComplete ? null : pickOrder[0],
        currentPickDeadlineAt: startsComplete ? null : new Date(now.getTime() + DEFAULT_PICK_TIME_LIMIT_SECONDS * 1000),
      },
    });

    await tx.season.update({ where: { id: seasonId }, data: { status: startsComplete ? "active" : "drafting" } });

    return draftEvent;
  });
}
