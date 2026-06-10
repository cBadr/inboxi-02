-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "deliverabilityCheckedAt" TIMESTAMP(3),
ADD COLUMN     "deliverabilityScore" INTEGER,
ADD COLUMN     "inboxScore" INTEGER;
