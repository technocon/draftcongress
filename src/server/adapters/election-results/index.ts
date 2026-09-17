import type { ElectionResultsPort } from "./port";
import { electionResultsFixtureAdapter } from "./fixtures";
import { createHarvardDataverseAdapter } from "./harvard-dataverse";

export type { ElectionResultsPort, RawElectionResult } from "./port";

/**
 * Returns the fixture adapter unless HARVARD_DATAVERSE_API_TOKEN is set,
 * in which case it returns the real MEDSL/Harvard Dataverse adapter —
 * same activation pattern as the congress-members and legislative
 * adapters. No code changes needed at token-provisioning time.
 */
export function getElectionResultsAdapter(): ElectionResultsPort {
  const apiToken = process.env.HARVARD_DATAVERSE_API_TOKEN;
  if (!apiToken) {
    return electionResultsFixtureAdapter;
  }
  return createHarvardDataverseAdapter(apiToken);
}
