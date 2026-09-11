import { prisma } from "@/server/db/client";
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

/**
 * League-admin convenience: add an owner by email directly, instead of
 * relying on them finding the league themselves and clicking "Join."
 * There's no invite-email flow yet (no email provider configured) — this
 * only works for someone who already has an account. The join page's own
 * "Join this league" button remains the other path in (anyone signed in
 * with the league's URL can use it — see the league detail page).
 */
export async function inviteOwnerByEmail(tenantId: string, leagueId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new LeagueError(`No account found for ${email} — they need to create an account first, then you can add them.`);
  }

  const isTenantMember = await withTenant(tenantId, (tx) =>
    tx.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } })
  );
  if (!isTenantMember) {
    throw new LeagueError(`${email} isn't part of this platform yet.`);
  }

  return joinLeague(tenantId, leagueId, user.id);
}
