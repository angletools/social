-- CreateTable
CREATE TABLE "IntelligenceBrief" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "summaryAr" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "themes" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntelligenceBrief_organizationId_days_createdAt_idx" ON "IntelligenceBrief"("organizationId", "days", "createdAt");

-- AddForeignKey
ALTER TABLE "IntelligenceBrief" ADD CONSTRAINT "IntelligenceBrief_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

