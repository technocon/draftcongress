-- AlterTable
ALTER TABLE "races" ADD COLUMN     "finance_candidate" TEXT,
ADD COLUMN     "finance_cash_on_hand" DOUBLE PRECISION,
ADD COLUMN     "finance_cycle" INTEGER,
ADD COLUMN     "finance_disbursements" DOUBLE PRECISION,
ADD COLUMN     "finance_receipts" DOUBLE PRECISION;
