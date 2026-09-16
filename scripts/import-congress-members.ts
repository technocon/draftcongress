/**
 * Local one-off runner for the same import the /api/jobs/import-congress-members
 * cron route triggers in production — for pulling real congress.gov data into
 * a dev database by hand right after setting CONGRESS_GOV_API_KEY, without
 * needing a running server + cron secret.
 */
import { runCongressMembersImport } from "../src/server/domain/reference-data/import-congress-members";
import { prisma } from "../src/server/db/client";

runCongressMembersImport()
  .then((summary) => {
    const usingRealData = Boolean(process.env.CONGRESS_GOV_API_KEY);
    console.log(`Source: ${usingRealData ? "congress.gov (live)" : "fixture (CONGRESS_GOV_API_KEY not set)"}`);
    console.log(summary);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
