-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "dkimGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "dmarcPolicy" TEXT NOT NULL DEFAULT 'quarantine',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
