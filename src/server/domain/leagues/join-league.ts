import { withTenant } from "@/server/db/tenant-client";

export class LeagueError extends Error {}

/** Adds `userId` as an owner (participant) of `leagueId`. No entitlement
 * check here — paid-tier gating happens at draft-pick time (SRD B4), not
 * at league membership. */
export async function joinLeague(tenantId: string, leagueId: string, userId: string) {
  return withTenant(tenantId, async (tx) => {
    const league = await tx.league.findUnique({ where: { id: leagueId } });
    if (!league) throw new LeagueError("League not found");

    const existing = await tx.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
    if (existing) return existing;

    return tx.leagueMembership.create({
      data: { tenantId, leagueId, userId, role: "owner" },
    });
  });
}
