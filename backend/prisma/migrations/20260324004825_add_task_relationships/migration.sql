-- CreateEnum
CREATE TYPE "TaskRelationshipType" AS ENUM ('BLOCKS', 'RELATES_TO', 'DUPLICATES', 'CREATED_FROM');

-- CreateTable
CREATE TABLE "TaskRelationship" (
    "id" TEXT NOT NULL,
    "type" "TaskRelationshipType" NOT NULL,
    "sourceTaskId" TEXT NOT NULL,
    "targetTaskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskRelationship_sourceTaskId_idx" ON "TaskRelationship"("sourceTaskId");

-- CreateIndex
CREATE INDEX "TaskRelationship_targetTaskId_idx" ON "TaskRelationship"("targetTaskId");

-- CreateIndex
CREATE INDEX "TaskRelationship_workspaceId_idx" ON "TaskRelationship"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRelationship_sourceTaskId_targetTaskId_type_key" ON "TaskRelationship"("sourceTaskId", "targetTaskId", "type");

-- AddForeignKey
ALTER TABLE "TaskRelationship" ADD CONSTRAINT "TaskRelationship_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRelationship" ADD CONSTRAINT "TaskRelationship_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRelationship" ADD CONSTRAINT "TaskRelationship_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
