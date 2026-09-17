import type { ElectionResultsPort, RawElectionResult } from "../port";
import resultsRaw from "./data/results.json";

/**
 * Fixture-backed ElectionResultsPort implementation — the default when no
 * HARVARD_DATAVERSE_API_TOKEN is configured (see ../index.ts's factory).
 * Covers the same handful of illustrative seats as
 * congress-members/fixtures — enough to exercise the import/matching
 * logic end-to-end with zero external accounts.
 */
export const electionResultsFixtureAdapter: ElectionResultsPort = {
  async fetchLatestHouseResults(): Promise<RawElectionResult[]> {
    return resultsRaw as RawElectionResult[];
  },
};
