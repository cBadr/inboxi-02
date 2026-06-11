-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sendQuotaOverride" INTEGER;

-- CreateTable
CREATE TABLE "Blocklist" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbuseReport" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reporterEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Blocklist_kind_idx" ON "Blocklist"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Blocklist_kind_value_key" ON "Blocklist"("kind", "value");

-- CreateIndex
CREATE INDEX "AbuseReport_status_idx" ON "AbuseReport"("status");
