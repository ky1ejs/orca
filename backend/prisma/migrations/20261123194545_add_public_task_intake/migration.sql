-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "createdByApiKeyId" TEXT,
ADD COLUMN     "externalUserRef" TEXT;

-- CreateTable
CREATE TABLE "ApiIdempotencyKey" (
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "taskId" TEXT,
    "pendingStorageKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiIdempotencyKey_pkey" PRIMARY KEY ("workspaceId","key")
);

-- CreateIndex
CREATE INDEX "ApiIdempotencyKey_taskId_createdAt_idx" ON "ApiIdempotencyKey"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_externalUserRef_idx" ON "Task"("workspaceId", "externalUserRef");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByApiKeyId_fkey" FOREIGN KEY ("createdByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiIdempotencyKey" ADD CONSTRAINT "ApiIdempotencyKey_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
