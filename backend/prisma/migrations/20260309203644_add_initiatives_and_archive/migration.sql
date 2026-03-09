-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "initiativeId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Initiative_workspaceId_idx" ON "Initiative"("workspaceId");

-- CreateIndex
CREATE INDEX "Project_initiativeId_idx" ON "Project"("initiativeId");

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
