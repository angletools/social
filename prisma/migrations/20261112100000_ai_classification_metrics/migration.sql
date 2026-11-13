-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "aiMonthlyTokenLimit" INTEGER NOT NULL DEFAULT 2000000,
ADD COLUMN     "enrichmentLeaseToken" TEXT,
ADD COLUMN     "enrichmentLeaseUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Mention" ADD COLUMN     "classificationConfidence" DOUBLE PRECISION,
ADD COLUMN     "classificationContextHash" TEXT,
ADD COLUMN     "classificationModel" TEXT,
ADD COLUMN     "classificationRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "classificationSource" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "classificationVersion" TEXT,
ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedById" TEXT;

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "reservedTokens" INTEGER NOT NULL,
    "usedTokens" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTurn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIUsage_organizationId_createdAt_idx" ON "AIUsage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTurn_organizationId_createdAt_idx" ON "AssistantTurn"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTurn_userId_status_expiresAt_idx" ON "AssistantTurn"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Mention_organizationId_platform_externalId_createdAt_id_idx" ON "Mention"("organizationId", "platform", "externalId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


UPDATE "Mention" SET "classificationSource" = CASE WHEN source = 'DEMO' THEN 'SAMPLE' ELSE 'LEGACY' END WHERE "enrichedAt" IS NOT NULL;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ai_budget_check" CHECK ("aiMonthlyTokenLimit" BETWEEN 0 AND 100000000);
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_classification_confidence_check" CHECK ("classificationConfidence" IS NULL OR "classificationConfidence" BETWEEN 0 AND 1);
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_classification_source_check" CHECK ("classificationSource" IN ('PENDING','HEURISTIC','MODEL','HUMAN','LEGACY','SAMPLE'));
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_tokens_check" CHECK ("reservedTokens" > 0 AND ("usedTokens" IS NULL OR "usedTokens" >= 0));
