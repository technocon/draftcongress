import type { $Enums } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { getLegislativeAdapter, chamberRefFor } from "@/server/adapters/legislative";
import { getElectoralAdapter } from "@/server/adapters/electoral";

interface NormalizedRawEvent {
  externalId: string;
  eventType: $Enums.ScoringEventType;
  occurredAt: Date;
  memberBioguideId?: string;
}

/**
 * Maps raw events to ScoringEvent rows, resolving each event to every bloc
 * the member belonged to AT THE TIME the event occurred (SRD §6.2: scoring
 * "derives from member-level data"; open question #9's answer: past events
 * are never retroactively rewritten when bloc composition later changes —
 * that's exactly why membership is checked against `occurredAt`, not "now").
 *
 * One raw event can fan out to multiple ScoringEvent rows if the member
 * belongs to more than one bloc at that time (e.g. a chamber-wide caucus
 * AND an ideological caucus simultaneously) — each gets its own row, with
 * `externalId` suffixed by blocId so the underlying
 * @@unique([source, externalId]) constraint stays per-(source, raw event,
 * bloc) rather than colliding across blocs, while still being idempotent
 * across re-runs.
 *
 * Base points come from the PLATFORM-DEFAULT ScoringConfig only (Phase 1
 * simplification, documented here rather than silently assumed): per-
 * league custom ScoringRule overrides are not applied at ingestion time.
 * The legislative/electoral WEIGHT that SRD §6.4 requires to be
 * tenant/league-configurable IS applied, but at roster read time — see
 * ./standings.ts — using each league's own ScoringConfig.
 */
export async function ingestRawEvents(
  source: string,
  rawEvents: NormalizedRawEvent[]
): Promise<{ created: number; skipped: number }> {
  const platformConfig = await prisma.scoringConfig.findFirst({ where: { tenantId: null } });
  if (!platformConfig) {
    throw new Error("No platform-default ScoringConfig found — run `npm run db:seed` first.");
  }

  const rules = await prisma.scoringRule.findMany({ where: { scoringConfigId: platformConfig.id } });
  const ruleByType = new Map(rules.map((r) => [r.eventType, r]));

  let created = 0;
  let skipped = 0;

  for (const raw of rawEvents) {
    if (!raw.memberBioguideId) {
      skipped++;
      continue;
    }

    const legislator = await prisma.legislator.findUnique({
      where: { bioguideId: raw.memberBioguideId },
      include: {
        blocMemberships: {
          where: {
            startDate: { lte: raw.occurredAt },
            OR: [{ endDate: null }, { endDate: { gte: raw.occurredAt } }],
          },
        },
      },
    });

    if (!legislator || legislator.blocMemberships.length === 0) {
      skipped++;
      continue;
    }

    const basePoints = ruleByType.get(raw.eventType)?.points ?? 0;

    for (const membership of legislator.blocMemberships) {
      const externalId = `${raw.externalId}:${membership.blocId}`;
      await prisma.scoringEvent.upsert({
        where: { source_externalId: { source, externalId } },
        update: {}, // idempotent: never overwrite an already-recorded fact
        create: {
          blocId: membership.blocId,
          legislatorId: legislator.id,
          eventType: raw.eventType,
          pointsAwarded: basePoints,
          source,
          externalId,
          occurredAt: raw.occurredAt,
        },
      });
      created++;
    }
  }

  return { created, skipped };
}

export interface IngestionSummary {
  chamber: "house" | "senate";
  kind: string;
  source: string;
  created: number;
  skipped: number;
  error?: string;
}

/** Runs the full legislative ingestion sweep across both seeded chambers. */
export async function runLegislativeIngestion(since: Date): Promise<IngestionSummary[]> {
  const adapter = getLegislativeAdapter();
  const sourceTag = process.env.CONGRESS_GOV_API_KEY ? "congress-gov" : "fixture-legislative";
  const voteSourceTag = process.env.CONGRESS_GOV_API_KEY ? "govtrack" : "fixture-legislative";

  const chambers = await prisma.chamber.findMany();
  const results: IngestionSummary[] = [];

  for (const chamber of chambers) {
    const chamberRef = safeChamberRef(chamber);
    if (!chamberRef) continue;

    for (const [kind, fetcher, tag] of [
      ["bill_actions", adapter.fetchBillActions, sourceTag],
      ["votes", adapter.fetchVotes, voteSourceTag],
      ["committee_actions", adapter.fetchCommitteeActions, sourceTag],
    ] as const) {
      try {
        const rawEvents = await fetcher(chamberRef, since);
        const { created, skipped } = await ingestRawEvents(tag, rawEvents);
        results.push({ chamber: chamberRef, kind, source: tag, created, skipped });
      } catch (err) {
        // One source failing (e.g. an unimplemented method, or a live API
        // error) must not abort the rest of the sweep.
        results.push({
          chamber: chamberRef,
          kind,
          source: tag,
          created: 0,
          skipped: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return results;
}

/** Runs the full electoral ingestion sweep across both seeded chambers. */
export async function runElectoralIngestion(since: Date): Promise<IngestionSummary[]> {
  const adapter = getElectoralAdapter();
  const sourceTag = process.env.FEC_API_KEY ? "fec" : "fixture-electoral";

  const chambers = await prisma.chamber.findMany();
  const results: IngestionSummary[] = [];

  for (const chamber of chambers) {
    const chamberRef = safeChamberRef(chamber);
    if (!chamberRef) continue;

    for (const [kind, fetcher] of [
      ["race_results", adapter.fetchRaceResults],
      ["primary_results", adapter.fetchPrimaryResults],
    ] as const) {
      try {
        const rawEvents = await fetcher(chamberRef, since);
        const { created, skipped } = await ingestRawEvents(sourceTag, rawEvents);
        results.push({ chamber: chamberRef, kind, source: sourceTag, created, skipped });
      } catch (err) {
        results.push({
          chamber: chamberRef,
          kind,
          source: sourceTag,
          created: 0,
          skipped: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return results;
}

function safeChamberRef(chamber: { name: string }): "house" | "senate" | null {
  try {
    return chamberRefFor(chamber);
  } catch {
    return null;
  }
}
