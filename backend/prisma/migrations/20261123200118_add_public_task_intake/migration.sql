-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "createdByApiKeyId" TEXT,
ADD COLUMN     "externalUserRef" TEXT;

-- CreateTable
CREATE TABLE "ApiIdempotencyKey" (
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "externalUserRef" TEXT,
    "taskId" TEXT,
    "completedAt" TIMESTAMP(3),
    "pendingStorageKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiIdempotencyKey_pkey" PRIMARY KEY ("workspaceId","key")
);

-- CreateTable
CREATE TABLE "DeletedExternalUser" (
    "workspaceId" TEXT NOT NULL,
    "externalUserRef" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedExternalUser_pkey" PRIMARY KEY ("workspaceId","externalUserRef")
);

-- CreateIndex
CREATE INDEX "ApiIdempotencyKey_completedAt_createdAt_idx" ON "ApiIdempotencyKey"("completedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_externalUserRef_idx" ON "Task"("workspaceId", "externalUserRef");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByApiKeyId_fkey" FOREIGN KEY ("createdByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiIdempotencyKey" ADD CONSTRAINT "ApiIdempotencyKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiIdempotencyKey" ADD CONSTRAINT "ApiIdempotencyKey_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedExternalUser" ADD CONSTRAINT "DeletedExternalUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
