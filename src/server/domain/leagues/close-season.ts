import { withTenant } from "@/server/db/tenant-client";
import { writeAuditLog } from "@/server/domain/audit/log";
import { LeagueError } from "./join-league";

/**
 * SRD Epic D1: "At the end of a season/cycle, league admin chooses: full
 * redraft, keeper ..., or the platform prompts them per the league's
 * stored redraft_policy." Closing is a separate, explicit step from
 * starting the next season — see start-season.ts, which reads
 * League.redraftPolicy (or an explicit override for
 * "admin_choice_per_cycle" leagues) to decide whether the new season's
 * rosters start empty or carry over the closed season's blocs.
 */
export async function closeSeason(tenantId: string, seasonId: string, actorUserId?: string) {
  return withTenant(tenantId, async (tx) => {
    const season = await tx.season.findUniqueOrThrow({ where: { id: seasonId } });
    if (season.status !== "active") {
      throw new LeagueError(`Season must be active to close (currently: ${season.status})`);
    }

    const closed = await tx.season.update({ where: { id: seasonId }, data: { status: "closed" } });

    await writeAuditLog(tx, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: "season.closed",
      entityType: "Season",
      entityId: seasonId,
      source: "user",
    });

    return closed;
  });
}
