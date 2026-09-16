import { prisma } from "@/server/db/client";
import { getCongressMembersAdapter } from "@/server/adapters/congress-members";
import type { RawMember } from "@/server/adapters/congress-members";

// Matches the cycle prisma/seed.ts generates Race rows under. Bump both in
// lockstep if a new election cycle's Race rows are ever seeded alongside
// (rather than replacing) this one.
const CYCLE = "2026";

export interface CongressMembersImportSummary {
  fetched: number;
  legislatorsUpserted: number;
  racesMatched: number;
  racesUnmatched: number;
}

/**
 * Pulls the current member roster (real congress.gov data once
 * CONGRESS_GOV_API_KEY is set, illustrative fixture data otherwise — see
 * src/server/adapters/congress-members) and:
 *   1. Upserts a Legislator row per member, keyed by bioguideId.
 *   2. Links each House member to their real (state, district) Race row.
 *   3. Links each Senate member to one of their state's 2 Race rows,
 *      assigned in a stable (bioguideId-sorted) order since congress.gov
 *      doesn't expose which of a state's two seats ("Class") a senator
 *      holds in the list endpoint — reruns are still idempotent, just not
 *      guaranteed to keep the SAME senator on the SAME seat number if a
 *      state's senators change.
 * Race.party is overwritten with the real value on a match (no longer
 * illustrative for matched seats); rating stays illustrative — there's no
 * real race-ratings feed wired up (see the Race model comment).
 */
export async function runCongressMembersImport(): Promise<CongressMembersImportSummary> {
  const adapter = getCongressMembersAdapter();
  const members = await adapter.fetchCurrentMembers();

  const houseChamber = await prisma.chamber.findFirstOrThrow({ where: { name: "U.S. House of Representatives" } });
  const senateChamber = await prisma.chamber.findFirstOrThrow({ where: { name: "U.S. Senate" } });

  const legislatorIdByBioguide = new Map<string, string>();
  for (const m of members) {
    const chamberId = m.chamber === "house" ? houseChamber.id : senateChamber.id;
    const legislator = await prisma.legislator.upsert({
      where: { bioguideId: m.bioguideId },
      update: {
        fullName: m.fullName,
        party: m.party,
        state: m.state,
        district: m.district != null ? String(m.district) : null,
        chamberId,
        status: "active",
      },
      create: {
        bioguideId: m.bioguideId,
        fullName: m.fullName,
        party: m.party,
        state: m.state,
        district: m.district != null ? String(m.district) : null,
        chamberId,
        status: "active",
      },
    });
    legislatorIdByBioguide.set(m.bioguideId, legislator.id);
  }

  let racesMatched = 0;
  let racesUnmatched = 0;

  const houseMembers = members.filter((m) => m.chamber === "house");
  for (const m of houseMembers) {
    const race = await prisma.race.findFirst({
      where: { chamberId: houseChamber.id, state: m.state, district: m.district, cycle: CYCLE },
    });
    if (!race) {
      racesUnmatched++;
      continue;
    }
    await prisma.race.update({
      where: { id: race.id },
      data: { party: m.party, incumbentLegislatorId: legislatorIdByBioguide.get(m.bioguideId) },
    });
    racesMatched++;
  }

  const senateMembersByState = new Map<string, RawMember[]>();
  for (const m of members.filter((m) => m.chamber === "senate")) {
    const arr = senateMembersByState.get(m.state) ?? [];
    arr.push(m);
    senateMembersByState.set(m.state, arr);
  }
  for (const [state, stateMembers] of senateMembersByState) {
    const races = await prisma.race.findMany({
      where: { chamberId: senateChamber.id, state, cycle: CYCLE },
      orderBy: { seatLabel: "asc" },
    });
    const sortedMembers = [...stateMembers].sort((a, b) => a.bioguideId.localeCompare(b.bioguideId));
    const pairCount = Math.min(races.length, sortedMembers.length);
    for (let i = 0; i < pairCount; i++) {
      const m = sortedMembers[i];
      await prisma.race.update({
        where: { id: races[i].id },
        data: { party: m.party, incumbentLegislatorId: legislatorIdByBioguide.get(m.bioguideId) },
      });
      racesMatched++;
    }
    racesUnmatched += sortedMembers.length - pairCount;
  }

  return {
    fetched: members.length,
    legislatorsUpserted: legislatorIdByBioguide.size,
    racesMatched,
    racesUnmatched,
  };
}
