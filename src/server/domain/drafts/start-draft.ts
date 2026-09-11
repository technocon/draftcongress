import { withTenant } from "@/server/db/tenant-client";
import { prisma } from "@/server/db/client";
import { DraftError } from "./errors";
import { shuffle } from "./pick-order";

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

    const availableBlocs = await prisma.bloc.count({ where: { taxonomyId: season.league.blocTaxonomyId } });
    const totalPicks = season.league.rosterSize * season.rosters.length;
    if (totalPicks > availableBlocs) {
      throw new DraftError(
        `Not enough blocs for this league: ${season.rosters.length} owners x ${season.league.rosterSize} roster size ` +
          `= ${totalPicks} picks needed, but only ${availableBlocs} blocs exist in this taxonomy.`
      );
    }

    const pickOrder = shuffle(season.rosters.map((r) => r.ownerUserId));
    const now = new Date();

    const draftEvent = await tx.draftEvent.create({
      data: {
        tenantId,
        seasonId,
        format: "async",
        status: "in_progress",
        pickOrder,
        pickTimeLimitSeconds: DEFAULT_PICK_TIME_LIMIT_SECONDS,
        currentPickIndex: 0,
        currentPickerUserId: pickOrder[0],
        currentPickDeadlineAt: new Date(now.getTime() + DEFAULT_PICK_TIME_LIMIT_SECONDS * 1000),
      },
    });

    await tx.season.update({ where: { id: seasonId }, data: { status: "drafting" } });

    return draftEvent;
  });
}
