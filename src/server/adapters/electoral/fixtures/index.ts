import type { ChamberRef, ElectoralDataPort, RawElectoralEvent } from "../port";
import raceResultsRaw from "./data/race-results.json";
import primaryResultsRaw from "./data/primary-results.json";

interface FixtureRow {
  chamber: ChamberRef;
  externalId: string;
  eventType: RawElectoralEvent["eventType"];
  occurredAt: string;
  memberBioguideId?: string;
  description?: string;
}

/** See ../legislative/fixtures/index.ts — same role, electoral side. */
export const electoralFixtureAdapter: ElectoralDataPort = {
  async fetchRaceResults(chamberRef, since) {
    return filterRows(raceResultsRaw as unknown as FixtureRow[], chamberRef, since);
  },
  async fetchPrimaryResults(chamberRef, since) {
    return filterRows(primaryResultsRaw as unknown as FixtureRow[], chamberRef, since);
  },
};

function filterRows(rows: FixtureRow[], chamberRef: ChamberRef, since: Date): RawElectoralEvent[] {
  return rows
    .filter((r) => r.chamber === chamberRef && new Date(r.occurredAt) >= since)
    .map(({ chamber: _chamber, ...rest }): RawElectoralEvent => ({ ...rest, occurredAt: new Date(rest.occurredAt) }));
}
