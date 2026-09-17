/**
 * Local one-off runner for the same import the /api/jobs/import-campaign-finance
 * cron route triggers in production — pulls real OpenFEC campaign-finance
 * data into a dev database by hand right after setting FEC_API_KEY. Takes
 * a few minutes: ~485 throttled requests (435 House + up to 100 Senate),
 * see src/server/adapters/campaign-finance/fec's rate-limit comment.
 */
import { runCampaignFinanceImport } from "../src/server/domain/reference-data/import-campaign-finance";
import { prisma } from "../src/server/db/client";

runCampaignFinanceImport()
  .then((summary) => {
    const usingRealData = Boolean(process.env.FEC_API_KEY);
    console.log(`Source: ${usingRealData ? "OpenFEC (live)" : "fixture (FEC_API_KEY not set)"}`);
    console.log(summary);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
