import type { ElectoralDataPort } from "./port";
import { electoralFixtureAdapter } from "./fixtures";
import { createFecAdapter } from "./fec";

export type { ChamberRef, ElectoralDataPort, RawElectoralEvent } from "./port";

/**
 * Same activation pattern as ../legislative/index.ts's
 * getLegislativeAdapter(). Note the real path here is partial —
 * fetchRaceResults still throws even when FEC_API_KEY is set, because no
 * authoritative general-election-results source has been selected yet
 * (see ../fec/index.ts's doc comment and SRD §11 open question #3). The
 * ingestion job (src/server/domain/scoring/ingest.ts) must handle that
 * failure per-source rather than letting it abort the whole run.
 */
export function getElectoralAdapter(): ElectoralDataPort {
  const apiKey = process.env.FEC_API_KEY;
  if (!apiKey) {
    return electoralFixtureAdapter;
  }
  return createFecAdapter(apiKey);
}
