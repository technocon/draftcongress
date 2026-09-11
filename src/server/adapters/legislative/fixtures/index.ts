import type { ChamberRef, LegislativeDataPort, RawLegislativeEvent } from "../port";
import billActionsRaw from "./data/bill-actions.json";
import votesRaw from "./data/votes.json";
import committeeActionsRaw from "./data/committee-actions.json";

interface FixtureRow {
  chamber: ChamberRef;
  externalId: string;
  eventType: RawLegislativeEvent["eventType"];
  occurredAt: string;
  memberBioguideId?: string;
  description?: string;
}

/**
 * Fixture-backed LegislativeDataPort implementation — the default in dev/
 * test/CI, and the fallback in production whenever no
 * CONGRESS_GOV_API_KEY/etc. is configured (see ../index.ts's factory). Not
 * a test-only stub: this is what a fresh install runs against with zero
 * external accounts, per the architecture plan §4.
 *
 * `since` filtering is applied here to mirror the real adapters' contract
 * even though the fixture dataset is small and static.
 */
export const legislativeFixtureAdapter: LegislativeDataPort = {
  async fetchBillActions(chamberRef, since) {
    return filterRows(billActionsRaw as unknown as FixtureRow[], chamberRef, since).filter(
      (r) => r.eventType === "bill_sponsored" || r.eventType === "bill_passed"
    );
  },
  async fetchVotes(chamberRef, since) {
    return filterRows(votesRaw as unknown as FixtureRow[], chamberRef, since);
  },
  async fetchCommitteeActions(chamberRef, since) {
    return filterRows(committeeActionsRaw as unknown as FixtureRow[], chamberRef, since);
  },
};

function filterRows(rows: FixtureRow[], chamberRef: ChamberRef, since: Date): RawLegislativeEvent[] {
  return rows
    .filter((r) => r.chamber === chamberRef && new Date(r.occurredAt) >= since)
    .map(({ chamber: _chamber, ...rest }): RawLegislativeEvent => ({ ...rest, occurredAt: new Date(rest.occurredAt) }));
}
