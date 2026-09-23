import { prisma } from "@/server/db/client";
import senateClassesByBioguide from "@/lib/senate-classes-by-bioguide.json";

const CYCLE = "2026"; // matches prisma/seed.ts's Race.cycle

export interface AssignSenateClassesSummary {
  total: number;
  matched: number;
  unmatched: number;
}

/**
 * Sets Race.senateClass for each Senate seat by matching its CURRENT
 * officeholder (Race.incumbentLegislatorId, set by
 * scripts/import-congress-members.ts) to a bioguide -> class lookup
 * (src/lib/senate-classes-by-bioguide.json, a static one-time export from
 * the public-domain unitedstates/congress-legislators project — a seat's
 * class doesn't change when its occupant does, so this only needs
 * re-running if a seat has never been matched yet, e.g. right after the
 * first congress-members import on a fresh database).
 */
export async function assignSenateClasses(): Promise<AssignSenateClassesSummary> {
  const senateChamber = await prisma.chamber.findFirstOrThrow({ where: { name: "U.S. Senate" } });
  const entries = Object.entries(senateClassesByBioguide as Record<string, number>);

  let matched = 0;
  let unmatched = 0;

  for (const [bioguideId, senateClass] of entries) {
    const legislator = await prisma.legislator.findUnique({ where: { bioguideId } });
    if (!legislator) {
      unmatched++;
      continue;
    }
    const race = await prisma.race.findFirst({
      where: { chamberId: senateChamber.id, cycle: CYCLE, incumbentLegislatorId: legislator.id },
    });
    if (!race) {
      unmatched++;
      continue;
    }
    await prisma.race.update({ where: { id: race.id }, data: { senateClass } });
    matched++;
  }

  return { total: entries.length, matched, unmatched };
}
