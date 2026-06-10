-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "fromName" TEXT,
ADD COLUMN     "fromNameMode" TEXT,
ADD COLUMN     "fromNames" JSONB;
