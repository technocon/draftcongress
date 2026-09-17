/**
 * Local one-off runner for the same import the /api/jobs/import-race-ratings
 * cron route triggers in production — pulls real Senate race ratings into
 * a dev database by hand right after setting DECISION_LABS_RATINGS_ENABLED.
 */
import { runRaceRatingsImport } from "../src/server/domain/reference-data/import-race-ratings";
import { prisma } from "../src/server/db/client";

runRaceRatingsImport()
  .then((summary) => {
    const usingRealData = process.env.DECISION_LABS_RATINGS_ENABLED === "true";
    console.log(`Source: ${usingRealData ? "decisionlabs.ai (live)" : "fixture (DECISION_LABS_RATINGS_ENABLED not set)"}`);
    console.log(summary);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
