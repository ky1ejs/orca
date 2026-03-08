-- AlterTable: Add taskCounter to Workspace
ALTER TABLE "Workspace" ADD COLUMN "taskCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add sequenceNumber and displayId to Task (nullable initially for backfill)
ALTER TABLE "Task" ADD COLUMN "sequenceNumber" INTEGER;
ALTER TABLE "Task" ADD COLUMN "displayId" TEXT;

-- Backfill: Assign sequential numbers per workspace, ordered by createdAt with id as tiebreaker
WITH numbered AS (
  SELECT t.id, t."workspaceId", w.slug,
         ROW_NUMBER() OVER (PARTITION BY t."workspaceId" ORDER BY t."createdAt", t.id) AS seq
  FROM "Task" t
  JOIN "Workspace" w ON t."workspaceId" = w.id
)
UPDATE "Task" SET
  "sequenceNumber" = numbered.seq,
  "displayId" = UPPER(numbered.slug) || '-' || numbered.seq
FROM numbered
WHERE "Task".id = numbered.id;

-- Backfill: Update workspace counters to match the max sequence number
UPDATE "Workspace" SET "taskCounter" = COALESCE(
  (SELECT MAX("sequenceNumber") FROM "Task" WHERE "Task"."workspaceId" = "Workspace".id),
  0
);

-- Make columns NOT NULL after backfill
ALTER TABLE "Task" ALTER COLUMN "sequenceNumber" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "displayId" SET NOT NULL;

-- CreateIndex: Unique index on displayId
CREATE UNIQUE INDEX "Task_displayId_key" ON "Task"("displayId");

-- CreateIndex: Compound index for workspace-scoped ordering queries
CREATE INDEX "Task_workspaceId_sequenceNumber_idx" ON "Task"("workspaceId", "sequenceNumber");
