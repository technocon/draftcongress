export interface RawElectoralEvent {
  externalId: string;
  eventType: "re_election_won" | "seat_flip" | "primary_result";
  occurredAt: Date;
  memberBioguideId?: string;
  description?: string;
}

/**
 * The boundary between the scoring engine and any upstream electoral-data
 * provider — mirrors ../legislative/port.ts's LegislativeDataPort.
 */
export interface ElectoralDataPort {
  fetchRaceResults(chamberRef: ChamberRef, since: Date): Promise<RawElectoralEvent[]>;
  fetchPrimaryResults(chamberRef: ChamberRef, since: Date): Promise<RawElectoralEvent[]>;
}

export type ChamberRef = "house" | "senate";
