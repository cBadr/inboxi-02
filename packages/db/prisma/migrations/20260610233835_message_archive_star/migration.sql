-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStarred" BOOLEAN NOT NULL DEFAULT false;
