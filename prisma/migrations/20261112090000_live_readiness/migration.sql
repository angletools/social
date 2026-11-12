-- CreateEnum
CREATE TYPE "DataMode" AS ENUM ('LIVE', 'DEMO');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "dataMode" "DataMode" NOT NULL DEFAULT 'LIVE';

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "syncLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "syncToken" TEXT;

-- AlterTable
ALTER TABLE "Mention" ADD COLUMN     "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source" "DataMode" NOT NULL DEFAULT 'LIVE';

-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN     "jobKey" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "weeklyKey" TEXT;

-- AlterTable
ALTER TABLE "TrendPost" ADD COLUMN     "source" "DataMode" NOT NULL DEFAULT 'LIVE';

-- AlterTable
ALTER TABLE "ContentDraft" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedRevision" INTEGER,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NotificationRead" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipients" TEXT[],
    "webhookUrl" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "sender" TEXT,
    "reportId" TEXT,
    "notificationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimToken" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationRead_userId_idx" ON "NotificationRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_dedupeKey_key" ON "Delivery"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_reportId_key" ON "Delivery"("reportId");

-- CreateIndex
CREATE INDEX "Delivery_status_nextAttemptAt_idx" ON "Delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Delivery_organizationId_createdAt_idx" ON "Delivery"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncRun_monitorId_platform_jobKey_key" ON "SyncRun"("monitorId", "platform", "jobKey");

-- CreateIndex
CREATE UNIQUE INDEX "Report_weeklyKey_key" ON "Report"("weeklyKey");

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep existing sample workspaces visibly DEMO, including previously mixed ones.
UPDATE "Mention" SET source = 'DEMO' WHERE "externalId" LIKE 'demo-%';
UPDATE "TrendPost" SET source = 'DEMO' WHERE "externalId" LIKE 'demo-trend-%';
UPDATE "Organization" o SET "dataMode" = 'DEMO'
WHERE o.slug = 'demo' OR EXISTS (SELECT 1 FROM "Mention" m WHERE m."organizationId" = o.id AND m.source = 'DEMO')
OR EXISTS (SELECT 1 FROM "TrendPost" p WHERE p."organizationId" = o.id AND p.source = 'DEMO');
-- Legacy approvals were not tied to content. Require a fresh review; keep published history.
UPDATE "ContentDraft" SET status = 'IN_REVIEW', "approvedById" = NULL WHERE status = 'APPROVED';
ALTER TABLE "ContentDraft" ADD CONSTRAINT "draft_approval_revision" CHECK (
 status != 'APPROVED' OR ("approvedRevision" IS NOT NULL AND "approvedRevision" = revision AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)
);
INSERT INTO "NotificationRead" ("notificationId", "userId", "readAt")
SELECT n.id, u.id, n."readAt" FROM "Notification" n JOIN "User" u ON u."organizationId" = n."organizationId"
WHERE n."readAt" IS NOT NULL AND (n."userId" IS NULL OR n."userId" = u.id);
-- Mode changes require a new workspace, so adding/removing API credentials cannot mix sources.
CREATE FUNCTION immutable_workspace_mode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."dataMode" != OLD."dataMode" THEN RAISE EXCEPTION 'Create a separate workspace to change data mode'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_workspace_mode BEFORE UPDATE OF "dataMode" ON "Organization" FOR EACH ROW EXECUTE FUNCTION immutable_workspace_mode();
CREATE FUNCTION enforce_collection_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source != (SELECT "dataMode" FROM "Organization" WHERE id = NEW."organizationId") THEN RAISE EXCEPTION 'Collection source must match workspace mode'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mention_collection_source BEFORE INSERT OR UPDATE OF source, "organizationId" ON "Mention" FOR EACH ROW EXECUTE FUNCTION enforce_collection_source();
CREATE TRIGGER trend_collection_source BEFORE INSERT OR UPDATE OF source, "organizationId" ON "TrendPost" FOR EACH ROW EXECUTE FUNCTION enforce_collection_source();
