-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "emailFrom" TEXT,
ADD COLUMN     "slackWebhookUrl" TEXT,
ADD COLUMN     "teamsWebhookUrl" TEXT;

-- CreateTable
CREATE TABLE "DraftVersion" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "instruction" TEXT,
    "content" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftVersion_draftId_n_key" ON "DraftVersion"("draftId", "n");

-- AddForeignKey
ALTER TABLE "DraftVersion" ADD CONSTRAINT "DraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: turn each draft's JSON history (newest first) plus its current content into numbered versions.
INSERT INTO "DraftVersion" ("id", "draftId", "n", "kind", "instruction", "content", "createdAt")
SELECT 'bf' || md5(d.id || '-' || v.n::text), d.id, v.n, v.kind, v.instruction, v.content, v.at
FROM "ContentDraft" d
CROSS JOIN LATERAL (
  WITH h AS (
    SELECT t.e, t.ord::int AS ord
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.history) = 'array' THEN d.history ELSE '[]'::jsonb END) WITH ORDINALITY AS t(e, ord)
  ),
  l AS (SELECT count(*)::int AS n FROM h)
  SELECT (l.n - h.ord + 1) AS n,
         CASE WHEN h.ord = l.n THEN 'GENERATED' ELSE 'REWRITE' END AS kind,
         (SELECT h2.e ->> 'instruction' FROM h h2 WHERE h2.ord = h.ord + 1) AS instruction,
         h.e -> 'content' AS content,
         COALESCE((SELECT ((h2.e ->> 'at')::timestamptz AT TIME ZONE 'UTC') FROM h h2 WHERE h2.ord = h.ord + 1), d."createdAt") AS at
  FROM h, l
  UNION ALL
  SELECT l.n + 1,
         CASE WHEN l.n = 0 THEN 'GENERATED' ELSE 'REWRITE' END,
         (SELECT h.e ->> 'instruction' FROM h WHERE h.ord = 1),
         d.content,
         COALESCE((SELECT ((h.e ->> 'at')::timestamptz AT TIME ZONE 'UTC') FROM h WHERE h.ord = 1), d."updatedAt")
  FROM l
) v
WHERE d.content IS NOT NULL AND v.content IS NOT NULL AND jsonb_typeof(v.content) = 'object';
