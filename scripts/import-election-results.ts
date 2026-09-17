/**
 * Local one-off runner for the same import the /api/jobs/import-election-results
 * cron route triggers in production — for pulling real MEDSL/Harvard
 * Dataverse election results into a dev database by hand right after
 * setting HARVARD_DATAVERSE_API_TOKEN, without needing a running server +
 * cron secret.
 */
import { runElectionResultsImport } from "../src/server/domain/reference-data/import-election-results";
import { prisma } from "../src/server/db/client";

runElectionResultsImport()
  .then((summary) => {
    const usingRealData = Boolean(process.env.HARVARD_DATAVERSE_API_TOKEN);
    console.log(`Source: ${usingRealData ? "MEDSL/Harvard Dataverse (live)" : "fixture (HARVARD_DATAVERSE_API_TOKEN not set)"}`);
    console.log(summary);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
