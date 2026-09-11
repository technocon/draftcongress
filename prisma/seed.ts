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
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      country: "US",
      level: "national",
      name: "United States Congress",
      chamberCount: 2,
      isActive: true,
    },
  });

  const house = await upsertChamber({
    id: "00000000-0000-0000-0000-000000000002",
    legislativeBodyId: congress.id,
    name: "U.S. House of Representatives",
    totalSeats: 435,
    majorityThreshold: 218,
  });

  const senate = await upsertChamber({
    id: "00000000-0000-0000-0000-000000000003",
    legislativeBodyId: congress.id,
    name: "U.S. Senate",
    totalSeats: 100,
    majorityThreshold: 51,
  });

  // --- Reference data: platform-default free-tier taxonomy (Epic B4, F3) ---

  const freeTaxonomy = await db.blocTaxonomy.upsert({
    where: { id: "00000000-0000-0000-0000-000000000004" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000004",
      tenantId: null,
      name: "Leadership Caucuses",
      tierRequired: "free",
    },
  });

  const paidTaxonomy = await db.blocTaxonomy.upsert({
    where: { id: "00000000-0000-0000-0000-000000000005" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000005",
      tenantId: null,
      name: "Ideological & Policy Blocs",
      tierRequired: "paid",
    },
  });

  // --- Reference data: platform-default scoring config + PLACEHOLDER rules ---

  const scoringConfig = await db.scoringConfig.upsert({
    where: { id: "00000000-0000-0000-0000-000000000006" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000006",
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

  console.log(`Seeded public tenant (${tenant.slug}), ${freeBlocs.length + paidBlocs.length} blocs, ${legislators.length} legislators.`);
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
