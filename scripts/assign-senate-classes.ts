/**
 * One-time (rerun-safe) local runner: assigns Race.senateClass to each
 * Senate seat by matching its current officeholder to
 * src/lib/senate-classes-by-bioguide.json. Run this AFTER
 * `npm run db:import-congress-members` — it needs real incumbentLegislatorId
 * values to know which seat is which.
 */
import { assignSenateClasses } from "../src/server/domain/reference-data/assign-senate-classes";
import { prisma } from "../src/server/db/client";

assignSenateClasses()
  .then((summary) => {
    console.log(summary);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
