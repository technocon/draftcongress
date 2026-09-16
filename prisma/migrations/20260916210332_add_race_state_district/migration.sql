/*
  Warnings:

  - Added the required column `state` to the `races` table without a default value. This is not possible if the table is not empty.

  Race rows are pure illustrative reference data regenerated in full by
  `npm run db:seed` (prisma/seed.ts) on every run, with no other table
  holding a foreign key to `races` — safe to clear before adding the new
  required column instead of backfilling a placeholder value. Re-run
  `npm run db:seed` after this migration to repopulate real state/district
  identities.
*/
-- TruncateTable
TRUNCATE TABLE "races";

-- AlterTable
ALTER TABLE "races" ADD COLUMN     "district" INTEGER,
ADD COLUMN     "state" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "races_chamber_id_state_idx" ON "races"("chamber_id", "state");
