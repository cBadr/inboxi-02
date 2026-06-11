-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "format" TEXT,
ADD COLUMN     "letterMode" TEXT,
ADD COLUMN     "letters" JSONB;
