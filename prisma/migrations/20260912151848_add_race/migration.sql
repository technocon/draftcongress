-- CreateEnum
CREATE TYPE "RaceRating" AS ENUM ('safe', 'likely', 'lean', 'toss_up');

-- CreateTable
CREATE TABLE "races" (
    "id" UUID NOT NULL,
    "chamber_id" UUID NOT NULL,
    "seat_label" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "rating" "RaceRating" NOT NULL DEFAULT 'safe',
    "incumbent_legislator_id" UUID,

    CONSTRAINT "races_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "races_chamber_id_cycle_idx" ON "races"("chamber_id", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "races_chamber_id_seat_label_cycle_key" ON "races"("chamber_id", "seat_label", "cycle");

-- AddForeignKey
ALTER TABLE "races" ADD CONSTRAINT "races_chamber_id_fkey" FOREIGN KEY ("chamber_id") REFERENCES "chambers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "races" ADD CONSTRAINT "races_incumbent_legislator_id_fkey" FOREIGN KEY ("incumbent_legislator_id") REFERENCES "legislators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
