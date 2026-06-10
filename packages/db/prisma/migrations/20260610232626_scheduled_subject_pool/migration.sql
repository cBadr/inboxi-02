-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "subjectMode" TEXT,
ADD COLUMN     "subjects" JSONB;
