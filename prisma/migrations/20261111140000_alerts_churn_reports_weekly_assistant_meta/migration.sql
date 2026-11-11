-- AlterEnum
ALTER TYPE "AlertKind" ADD VALUE 'CHURN_RISK';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "weekly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AssistantMessage" ADD COLUMN "meta" JSONB;
