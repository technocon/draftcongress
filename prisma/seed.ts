/**
 * Seeds reference data + the public tenant for local/dev use.
 *
 * Runs via the admin (BYPASSRLS) client — see src/server/db/client.ts —
 * since it writes the platform-default (tenant_id = null) BlocTaxonomy and
 * ScoringConfig rows and the Tenant row itself, none of which a
 * tenant-scoped app_runtime connection could write (there's no tenant
 * context to scope them to yet).
 *
 * ScoringRule point values below are PLACEHOLDERS (SRD open question #4)
 * and Legislator/Bloc/BlocMembership rows are a small illustrative dev
 * dataset, NOT real current Congress data — that arrives via the
 * Congress.gov/GovTrack adapters (src/server/adapters/legislative) once
 * real ingestion is wired up. Do not treat this seed data as authoritative.
 */
import { createAdminClient } from "../src/server/db/client";
import { HOUSE_SEATS_BY_STATE, houseDistrictLabel } from "../src/lib/us-house-apportionment";
import { US_STATES } from "../src/lib/us-states";

const db = createAdminClient();

const PUBLIC_TENANT_SLUG = process.env.PUBLIC_TENANT_SLUG ?? "public";

/** Exported so tests can seed reference data directly rather than shelling
 * out to `npm run db:seed` — idempotent (upsert-based), safe to call
 * repeatedly. Only auto-runs as a top-level script (see the
 * import.meta.url guard at the bottom of this file). */
export async function main() {
  const tenant = await db.tenant.upsert({
    where: { slug: PUBLIC_TENANT_SLUG },
    update: {},
    create: {
      slug: PUBLIC_TENANT_SLUG,
      type: "public",
      name: "Draft Congress",
    },
  });

  // --- Reference data: legislative body / chambers (SRD §6.1, Epic F1) ---

  // NOTE: these are fixed placeholder UUIDs (hex digits only, so they're
  // valid `uuid` literals) used purely so this seed script is idempotent
  // across re-runs via upsert — they carry no other meaning.
  const congress = await db.legislativeBody.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      country: "US",
      level: "national",
      name: "United States Congress",
      chamberCount: 2,
      isActive: true,
    },
  });

  const house = await upsertChamber({
    id: "00000000-0000-4000-8000-000000000002",
    legislativeBodyId: congress.id,
    name: "U.S. House of Representatives",
    totalSeats: 435,
    majorityThreshold: 218,
  });

  const senate = await upsertChamber({
    id: "00000000-0000-4000-8000-000000000003",
    legislativeBodyId: congress.id,
    name: "U.S. Senate",
    totalSeats: 100,
    majorityThreshold: 51,
  });

  // --- Reference data: platform-default free-tier taxonomy (Epic B4, F3) ---

  const freeTaxonomy = await db.blocTaxonomy.upsert({
    where: { id: "00000000-0000-4000-8000-000000000004" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000004",
      tenantId: null,
      name: "Leadership Caucuses",
      tierRequired: "free",
    },
  });

  const paidTaxonomy = await db.blocTaxonomy.upsert({
    where: { id: "00000000-0000-4000-8000-000000000005" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000005",
      tenantId: null,
      name: "Ideological & Policy Blocs",
      tierRequired: "paid",
    },
  });

  // --- Reference data: platform-default scoring config + PLACEHOLDER rules ---

  const scoringConfig = await db.scoringConfig.upsert({
    where: { id: "00000000-0000-4000-8000-000000000006" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000006",
      tenantId: null,
      legislativeWeight: 0.5,
      electoralWeight: 0.5,
    },
  });

  const placeholderRules: Array<{
    eventType:
      | "bill_passed"
      | "bill_sponsored"
      | "vote_cast"
      | "committee_action"
      | "re_election_won"
      | "seat_flip"
      | "primary_result";
    points: number;
    appliesToTier: "free" | "paid";
  }> = [
    { eventType: "bill_sponsored", points: 2, appliesToTier: "free" },
    { eventType: "bill_passed", points: 5, appliesToTier: "free" },
    { eventType: "vote_cast", points: 0.1, appliesToTier: "free" },
    { eventType: "committee_action", points: 1, appliesToTier: "free" },
    { eventType: "re_election_won", points: 10, appliesToTier: "free" },
    { eventType: "seat_flip", points: -15, appliesToTier: "free" },
    { eventType: "primary_result", points: 3, appliesToTier: "free" },
  ];

  for (const rule of placeholderRules) {
    await db.scoringRule.upsert({
      where: {
        scoringConfigId_eventType: {
          scoringConfigId: scoringConfig.id,
          eventType: rule.eventType,
        },
      },
      update: { points: rule.points },
      create: { scoringConfigId: scoringConfig.id, ...rule },
    });
  }

  // --- Reference data: a small illustrative set of blocs + legislators ---
  // NOT real current membership — dev/demo data only, until the
  // legislative-data adapters populate this for real.

  const freeBlocs = [
    { key: "house-freedom", chamber: house, name: "House Freedom Caucus", type: "leadership" as const },
    { key: "house-dem", chamber: house, name: "House Democratic Caucus", type: "leadership" as const },
    { key: "house-rep", chamber: house, name: "House Republican Conference", type: "leadership" as const },
    { key: "senate-dem", chamber: senate, name: "Senate Democratic Caucus", type: "leadership" as const },
    { key: "senate-rep", chamber: senate, name: "Senate Republican Conference", type: "leadership" as const },
  ];

  const paidBlocs = [
    { key: "progressive", chamber: house, name: "Congressional Progressive Caucus", type: "ideological" as const },
    { key: "blue-dog", chamber: house, name: "Blue Dog Coalition", type: "ideological" as const },
  ];

  const blocByKey = new Map<string, { id: string }>();

  for (const b of freeBlocs) {
    const bloc = await upsertBloc({
      id: deterministicId("bloc", b.key),
      chamberId: b.chamber.id,
      taxonomyId: freeTaxonomy.id,
      name: b.name,
      blocType: b.type,
      isPaidTier: false,
    });
    blocByKey.set(b.key, bloc);
  }

  for (const b of paidBlocs) {
    const bloc = await upsertBloc({
      id: deterministicId("bloc", b.key),
      chamberId: b.chamber.id,
      taxonomyId: paidTaxonomy.id,
      name: b.name,
      blocType: b.type,
      isPaidTier: true,
    });
    blocByKey.set(b.key, bloc);
  }

  // A handful of illustrative legislators, each seated in one free-tier bloc.
  // bioguideId values here are fake-but-plausible (real bioguide IDs follow
  // this LNNNNNN shape) and MUST match tests/fixtures + the fixture
  // legislative/electoral adapters' RawEvent.memberBioguideId values, since
  // that's the join key the ingestion job uses to resolve events to blocs.
  const legislators = [
    { key: "leg-1", bioguideId: "S000001", fullName: "Rep. A. Sample (Freedom Caucus seat)", chamber: house, party: "R", state: "TX", bloc: "house-freedom" },
    { key: "leg-2", bioguideId: "S000002", fullName: "Rep. B. Sample (House Dem seat)", chamber: house, party: "D", state: "CA", bloc: "house-dem" },
    { key: "leg-3", bioguideId: "S000003", fullName: "Rep. C. Sample (House GOP seat)", chamber: house, party: "R", state: "OH", bloc: "house-rep" },
    { key: "leg-4", bioguideId: "S000004", fullName: "Sen. D. Sample (Senate Dem seat)", chamber: senate, party: "D", state: "NY", bloc: "senate-dem" },
    { key: "leg-5", bioguideId: "S000005", fullName: "Sen. E. Sample (Senate GOP seat)", chamber: senate, party: "R", state: "TX", bloc: "senate-rep" },
    { key: "leg-6", bioguideId: "S000006", fullName: "Rep. F. Sample (Progressive Caucus seat)", chamber: house, party: "D", state: "WA", bloc: "progressive" },
  ];

  const legislatorRecordByKey = new Map<string, { id: string; party: string; chamberId: string }>();

  for (const l of legislators) {
    const legislator = await db.legislator.upsert({
      where: { id: deterministicId("leg", l.key) },
      update: { bioguideId: l.bioguideId, fullName: l.fullName, party: l.party, state: l.state },
      create: {
        id: deterministicId("leg", l.key),
        chamberId: l.chamber.id,
        bioguideId: l.bioguideId,
        fullName: l.fullName,
        party: l.party,
        state: l.state,
        status: "active",
      },
    });
    legislatorRecordByKey.set(l.key, { id: legislator.id, party: l.party, chamberId: l.chamber.id });

    const bloc = blocByKey.get(l.bloc)!;
    const membershipId = deterministicId("blocmem", `${l.key}-${l.bloc}`);
    const existing = await db.blocMembership.findUnique({ where: { id: membershipId } });
    if (!existing) {
      await db.blocMembership.create({
        // Backdated well before any fixture ScoringEvent dates — the
        // default `startDate: now()` would otherwise start membership
        // AFTER the fixture data's occurredAt timestamps, so no active
        // membership would ever be found at ingestion time.
        data: {
          id: membershipId,
          blocId: bloc.id,
          legislatorId: legislator.id,
          startDate: new Date("2025-01-01T00:00:00.000Z"),
        },
      });
    }
  }

  // --- Reference data: one Race per real seat, both chambers (the
  // /congress arc chart + per-state district map's data source). Seat
  // identity (state/district) is REAL, generated from
  // HOUSE_SEATS_BY_STATE — only party/rating are illustrative PLACEHOLDER
  // values (see the model comment in schema.prisma). Deterministic via a
  // fixed-seed PRNG so re-running this script doesn't reshuffle ratings.
  // Each illustrative Legislator above is pinned to district 1 (House) or
  // Senate Seat 1 of their own seeded `state`, so they have a full
  // incumbent record to drill into from that real seat.
  const houseIncumbents = legislators
    .filter((l) => l.chamber === house)
    .map((l) => ({ key: l.key, state: l.state }));
  const senateIncumbents = legislators
    .filter((l) => l.chamber === senate)
    .map((l) => ({ key: l.key, state: l.state }));

  const raceCount = await seedRaces({
    house,
    senate,
    incumbents: houseIncumbents,
    senateIncumbents,
    legislatorRecordByKey,
  });

  console.log(
    `Seeded public tenant (${tenant.slug}), ${freeBlocs.length + paidBlocs.length} blocs, ${legislators.length} legislators, ${raceCount} races.`
  );
}

async function upsertChamber(input: {
  id: string;
  legislativeBodyId: string;
  name: string;
  totalSeats: number;
  majorityThreshold: number;
}) {
  return db.chamber.upsert({
    where: { id: input.id },
    update: {},
    create: input,
  });
}

async function upsertBloc(input: {
  id: string;
  chamberId: string;
  taxonomyId: string;
  name: string;
  blocType: "leadership" | "ideological" | "policy" | "custom";
  isPaidTier: boolean;
}) {
  return db.bloc.upsert({
    where: { id: input.id },
    update: {},
    create: input,
  });
}

/** Deterministic PRNG (mulberry32) — fixed seed so re-running the seed script produces identical race data. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RaceRatingValue = "safe" | "likely" | "lean" | "toss_up";

/**
 * One Race row per REAL seat in each chamber (real state + district
 * identity, from HOUSE_SEATS_BY_STATE — see src/lib/us-house-apportionment.ts)
 * — the /congress arc chart's and the per-state district map's data
 * source. party/rating are illustrative PLACEHOLDER values (see the Race
 * model comment in schema.prisma), roughly shaped like real aggregate
 * chamber composition but not sourced from any real race-ratings feed —
 * scripts/import-congress-members.ts overwrites party + incumbent with
 * real congress.gov data when CONGRESS_GOV_API_KEY is configured. A
 * handful of seats are pinned here to our already-seeded illustrative
 * Legislators so those have a full incumbent record to drill into without
 * needing an API key; the rest get incumbentLegislatorId = null.
 */
async function seedRaces(input: {
  house: { id: string };
  senate: { id: string };
  incumbents: Array<{ key: string; state: string }>;
  senateIncumbents: Array<{ key: string; state: string }>;
  legislatorRecordByKey: Map<string, { id: string; party: string; chamberId: string }>;
}): Promise<number> {
  const { house, senate, incumbents, senateIncumbents, legislatorRecordByKey } = input;
  const cycle = "2026";
  const rng = mulberry32(20260912);

  // Weighted rating pool: most seats aren't competitive.
  const ratingPool: RaceRatingValue[] = [
    ...Array(70).fill("safe"),
    ...Array(15).fill("likely"),
    ...Array(10).fill("lean"),
    ...Array(5).fill("toss_up"),
  ] as RaceRatingValue[];
  const pickRating = () => ratingPool[Math.floor(rng() * ratingPool.length)];

  function shuffledParties(totalSeats: number, rCount: number): string[] {
    const parties = [...Array(rCount).fill("R"), ...Array(totalSeats - rCount).fill("D")];
    for (let i = parties.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [parties[i], parties[j]] = [parties[j], parties[i]];
    }
    return parties;
  }

  async function upsertRace(chamberId: string, seatLabel: string, state: string, district: number | null, party: string, rating: RaceRatingValue, incumbentLegislatorId: string | null) {
    await db.race.upsert({
      where: { chamberId_seatLabel_cycle: { chamberId, seatLabel, cycle } },
      update: { state, district, party, rating, incumbentLegislatorId },
      create: { chamberId, seatLabel, cycle, state, district, party, rating, incumbentLegislatorId },
    });
  }

  // --- House: one Race per real district, generated from apportionment ---
  const pinnedHouseByState = new Map(incumbents.map((p) => [p.state, p.key]));
  const houseParties = shuffledParties(435, 219);
  let houseSeatIndex = 0;
  for (const [state, seatCount] of Object.entries(HOUSE_SEATS_BY_STATE)) {
    for (let district = 1; district <= seatCount; district++) {
      // Only district 1 of a pinned incumbent's state gets pinned — the
      // rest of that state's districts are unpinned like any other seat.
      const pinnedKey = district === 1 ? pinnedHouseByState.get(state) : undefined;
      const pinned = pinnedKey ? legislatorRecordByKey.get(pinnedKey) : undefined;
      await upsertRace(
        house.id,
        houseDistrictLabel(state, district),
        state,
        district,
        pinned?.party ?? houseParties[houseSeatIndex],
        pinned ? "safe" : pickRating(),
        pinned?.id ?? null
      );
      houseSeatIndex++;
    }
  }

  // --- Senate: 2 seats per state (real, no district subdivision) ---
  const pinnedSenateByState = new Map(senateIncumbents.map((p) => [p.state, p.key]));
  const senateParties = shuffledParties(100, 52);
  let senateSeatIndex = 0;
  for (const s of US_STATES) {
    for (let seatNum = 1; seatNum <= 2; seatNum++) {
      const pinnedKey = seatNum === 1 ? pinnedSenateByState.get(s.code) : undefined;
      const pinned = pinnedKey ? legislatorRecordByKey.get(pinnedKey) : undefined;
      await upsertRace(
        senate.id,
        `${s.code} Senate Seat ${seatNum}`,
        s.code,
        null,
        pinned?.party ?? senateParties[senateSeatIndex],
        pinned ? "safe" : pickRating(),
        pinned?.id ?? null
      );
      senateSeatIndex++;
    }
  }

  return 435 + 100;
}

/** Deterministic, re-run-safe UUID-shaped id for dev seed rows only. */
function deterministicId(namespace: string, key: string): string {
  const hex = Buffer.from(`${namespace}:${key}`).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Guard against auto-running when imported by the test suite (which sets
// VITEST) rather than executed directly via `npm run db:seed`.
if (!process.env.VITEST) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
