import { z } from "zod";
import { withTenant } from "@/server/db/tenant-client";
import { writeAuditLog } from "@/server/domain/audit/log";
import { LeagueError } from "./join-league";

const startSeasonSchema = z.object({
  electionCycle: z.string().trim().min(1).max(20),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  /** Only consulted for leagues with redraftPolicy = "admin_choice_per_cycle" (SRD D1) — ignored otherwise. */
  redraftChoice: z.enum(["full_redraft", "keeper"]).optional(),
});

export type StartSeasonInput = z.input<typeof startSeasonSchema>;

/**
 * Creates a Season for `leagueId` and a Roster for every current owner
 * (LeagueMembership role="owner") — rosters must exist before the draft
 * engine can attach picks to them. Reused both for a league's first season
 * and for SRD D3 ("a new season ... without losing historical standings":
 * nothing here touches prior seasons, they just stay queryable).
 *
 * Epic D1's redraft/keeper choice happens here: if the effective policy is
 * "keeper", every returning owner's Roster is pre-populated with the
 * SAME blocs their roster held at the end of the most recent prior season
 * for this league (Phase 1 simplification: keep-all, not owner-selectable
 * keepers — SRD only requires the policy be data-driven, not that partial
 * keeper selection exist yet). Kept blocs are NOT DraftPicks — they were
 * drafted in a prior cycle; the upcoming draft only needs to fill the
 * remaining roster slots, which startDraft.ts accounts for.
 */
export async function startSeason(tenantId: string, leagueId: string, input: StartSeasonInput) {
  const parsed = startSeasonSchema.parse(input);
  if (parsed.endDate <= parsed.startDate) {
    throw new LeagueError("endDate must be after startDate");
  }

  return withTenant(tenantId, async (tx) => {
    const league = await tx.league.findUniqueOrThrow({ where: { id: leagueId } });
    const owners = await tx.leagueMembership.findMany({
      where: { leagueId, role: "owner" },
      select: { userId: true },
    });
    if (owners.length === 0) {
      throw new LeagueError("A league needs at least one owner before starting a season");
    }

    const effectivePolicy =
      league.redraftPolicy === "admin_choice_per_cycle" ? (parsed.redraftChoice ?? "full_redraft") : league.redraftPolicy;

    const priorSeason =
      effectivePolicy === "keeper"
        ? await tx.season.findFirst({ where: { leagueId }, orderBy: { startDate: "desc" } })
        : null;

    const priorRostersByOwner = priorSeason
      ? new Map(
          (
            await tx.roster.findMany({
              where: { seasonId: priorSeason.id },
              include: { rosterBlocs: { select: { blocId: true } } },
            })
          ).map((r) => [r.ownerUserId, r.rosterBlocs])
        )
      : new Map<string, { blocId: string }[]>();

    const season = await tx.season.create({
      data: {
        tenantId,
        leagueId,
        electionCycle: parsed.electionCycle,
        status: "pre_draft",
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        rosters: {
          create: owners.map((o) => ({ tenantId, ownerUserId: o.userId })),
        },
      },
      include: { rosters: true },
    });

    if (effectivePolicy === "keeper" && priorRostersByOwner.size > 0) {
      for (const roster of season.rosters) {
        const keptBlocs = priorRostersByOwner.get(roster.ownerUserId) ?? [];
        for (const { blocId } of keptBlocs) {
          await tx.rosterBloc.create({
            data: { tenantId, rosterId: roster.id, seasonId: season.id, blocId },
          });
        }
      }
    }

    await writeAuditLog(tx, {
      tenantId,
      action: "season.started",
      entityType: "Season",
      entityId: season.id,
      after: { electionCycle: season.electionCycle, effectivePolicy },
      source: "user",
    });

    return season;
  });
}
