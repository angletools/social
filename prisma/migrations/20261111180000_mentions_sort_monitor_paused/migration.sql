-- Monitors: remember when a monitor was paused (the list shows "Paused 3 days ago"
-- and cuts its sparkline there).
ALTER TABLE "Monitor" ADD COLUMN "pausedAt" TIMESTAMP(3);
UPDATE "Monitor" SET "pausedAt" = "updatedAt" WHERE "status" = 'PAUSED';

-- Mentions: total engagement as a stored generated column, so the mentions list
-- and the CSV export can sort by "most engaged" in the database.
ALTER TABLE "Mention" ADD COLUMN "engagement" INTEGER GENERATED ALWAYS AS ("likes" + "comments" + "shares") STORED;

-- CreateIndex
CREATE INDEX "Mention_organizationId_engagement_idx" ON "Mention"("organizationId", "engagement");
