import { z } from "zod";
import { withTenant } from "@/server/db/tenant-client";
import { LeagueError } from "./join-league";

const startSeasonSchema = z.object({
  electionCycle: z.string().trim().min(1).max(20),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export type StartSeasonInput = z.input<typeof startSeasonSchema>;

/**
 * Creates a Season for `leagueId` and a Roster for every current owner
 * (LeagueMembership role="owner") — rosters must exist before the draft
 * engine can attach picks to them. SRD D3: "A new season for the next
 * election cycle can be created from an existing league without losing
 * historical standings" — this same function is reused for that, since
 * nothing here touches prior seasons.
 */
export async function startSeason(tenantId: string, leagueId: string, input: StartSeasonInput) {
  const parsed = startSeasonSchema.parse(input);
  if (parsed.endDate <= parsed.startDate) {
    throw new LeagueError("endDate must be after startDate");
  }

  return withTenant(tenantId, async (tx) => {
    const owners = await tx.leagueMembership.findMany({
      where: { leagueId, role: "owner" },
      select: { userId: true },
    });
    if (owners.length === 0) {
      throw new LeagueError("A league needs at least one owner before starting a season");
    }

    return tx.season.create({
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
  });
}
