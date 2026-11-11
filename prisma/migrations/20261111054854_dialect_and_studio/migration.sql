-- CreateEnum
CREATE TYPE "Dialect" AS ENUM ('SAUDI', 'KHALEEJI', 'EGYPTIAN', 'LEVANTINE', 'IRAQI', 'MAGHREBI', 'MSA', 'ARABIZI', 'ENGLISH', 'OTHER');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('COMPLAINT', 'QUESTION', 'PRAISE', 'PURCHASE_INTENT', 'CHURN_RISK', 'SUGGESTION', 'OTHER');

-- AlterTable
ALTER TABLE "Mention" ADD COLUMN     "dialect" "Dialect",
ADD COLUMN     "intent" "Intent",
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "sarcasm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slang" JSONB,
ADD COLUMN     "translation" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "complianceRules" TEXT;

-- CreateTable
CREATE TABLE "LexiconTerm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "dialect" "Dialect",
    "sentimentHint" "Sentiment",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexiconTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dialect" "Dialect",
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "approvedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandVoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "dialect" "Dialect" NOT NULL DEFAULT 'SAUDI',
    "traits" TEXT[],
    "dos" TEXT[],
    "donts" TEXT[],
    "bannedWords" TEXT[],
    "audience" TEXT,
    "ctaStyle" TEXT,
    "emojiPolicy" TEXT,
    "examples" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandVoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendWatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platforms" "Platform"[],
    "seeds" TEXT[],
    "accounts" TEXT[],
    "minViews" INTEGER NOT NULL DEFAULT 20000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScanAt" TIMESTAMP(3),
    "lastScanError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "text" TEXT NOT NULL,
    "authorHandle" TEXT,
    "authorFollowers" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER,
    "viralityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outlierRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formatId" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendFormat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "watchId" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "summaryAr" TEXT NOT NULL,
    "hookPattern" TEXT NOT NULL,
    "whyItWorks" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "platforms" "Platform"[],
    "momentum" TEXT NOT NULL DEFAULT 'NEW',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "totalViews" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "formatId" TEXT,
    "voiceId" TEXT,
    "title" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'TIKTOK',
    "dialect" "Dialect" NOT NULL DEFAULT 'SAUDI',
    "goal" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "content" JSONB,
    "history" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LexiconTerm_organizationId_term_key" ON "LexiconTerm"("organizationId", "term");

-- CreateIndex
CREATE INDEX "ReplyDraft_mentionId_idx" ON "ReplyDraft"("mentionId");

-- CreateIndex
CREATE INDEX "BrandVoice_organizationId_idx" ON "BrandVoice"("organizationId");

-- CreateIndex
CREATE INDEX "TrendWatch_organizationId_idx" ON "TrendWatch"("organizationId");

-- CreateIndex
CREATE INDEX "TrendPost_organizationId_viralityScore_idx" ON "TrendPost"("organizationId", "viralityScore");

-- CreateIndex
CREATE UNIQUE INDEX "TrendPost_watchId_platform_externalId_key" ON "TrendPost"("watchId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "TrendFormat_organizationId_score_idx" ON "TrendFormat"("organizationId", "score");

-- CreateIndex
CREATE INDEX "ContentDraft_organizationId_updatedAt_idx" ON "ContentDraft"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Mention_organizationId_intent_status_idx" ON "Mention"("organizationId", "intent", "status");

-- AddForeignKey
ALTER TABLE "LexiconTerm" ADD CONSTRAINT "LexiconTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVoice" ADD CONSTRAINT "BrandVoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendWatch" ADD CONSTRAINT "TrendWatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendPost" ADD CONSTRAINT "TrendPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendPost" ADD CONSTRAINT "TrendPost_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "TrendWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendPost" ADD CONSTRAINT "TrendPost_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "TrendFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendFormat" ADD CONSTRAINT "TrendFormat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendFormat" ADD CONSTRAINT "TrendFormat_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "TrendWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "TrendFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "BrandVoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
