/**
 * Local one-off runner for the same import the /api/jobs/import-election-results
 * cron route triggers in production — for pulling real MEDSL/Harvard
 * Dataverse election results into a dev database by hand, without needing
 * a running server + cron secret.
 *
 * Usage:
 *   npm run db:import-election-results
 *     -> live fetch if HARVARD_DATAVERSE_API_TOKEN is set, fixture data otherwise
 *   npm run db:import-election-results -- /path/to/1976-2024-house.tab
 *     -> reads a locally downloaded copy instead (see createLocalFileAdapter's
 *        comment — needed when the live fetch is blocked by Dataverse's
 *        guestbook requirement even with a valid token)
 */
import { runElectionResultsImport } from "../src/server/domain/reference-data/import-election-results";
import { createLocalFileAdapter } from "../src/server/adapters/election-results/harvard-dataverse";
import { prisma } from "../src/server/db/client";

const localFilePath = process.argv[2];
const adapter = localFilePath ? createLocalFileAdapter(localFilePath) : undefined;

runElectionResultsImport(adapter)
  .then((summary) => {
    const source = localFilePath
      ? `local file (${localFilePath})`
      : process.env.HARVARD_DATAVERSE_API_TOKEN
        ? "MEDSL/Harvard Dataverse (live)"
        : "fixture (HARVARD_DATAVERSE_API_TOKEN not set)";
    console.log(`Source: ${source}`);
    console.log(summary);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
