/**
 * A raw legislative fact from an upstream source, normalized to the shape
 * the scoring ingestion job expects (src/server/domain/scoring/ingest.ts).
 * `externalId` + the source name is what ScoringEvent's
 * @@unique([source, externalId]) uses for idempotent upserts.
 */
export interface RawLegislativeEvent {
  externalId: string;
  eventType: "bill_passed" | "bill_sponsored" | "vote_cast" | "committee_action";
  occurredAt: Date;
  /** Congress.gov bioguide id — matches Legislator.bioguideId. Undefined for
   * chamber-wide events with no single attributable member. */
  memberBioguideId?: string;
  description?: string;
}

/**
 * The boundary between the scoring engine and any upstream legislative-data
 * provider. Every implementation (real or fixture) satisfies this same
 * shape, so the ingestion job and scoring engine never know or care which
 * one is active — see ./index.ts's getLegislativeAdapter().
 */
export interface LegislativeDataPort {
  /** chamberRef identifies which chamber to query — see ./chamber-ref.ts. */
  fetchBillActions(chamberRef: ChamberRef, since: Date): Promise<RawLegislativeEvent[]>;
  fetchVotes(chamberRef: ChamberRef, since: Date): Promise<RawLegislativeEvent[]>;
  fetchCommitteeActions(chamberRef: ChamberRef, since: Date): Promise<RawLegislativeEvent[]>;
}

export type ChamberRef = "house" | "senate";
