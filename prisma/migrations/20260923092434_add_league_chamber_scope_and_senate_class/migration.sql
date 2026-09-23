-- CreateEnum
CREATE TYPE "LeagueChamberScope" AS ENUM ('all', 'house', 'senate');

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "chamber_scope" "LeagueChamberScope" NOT NULL DEFAULT 'all';

-- AlterTable
ALTER TABLE "races" ADD COLUMN     "senate_class" INTEGER;
