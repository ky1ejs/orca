-- AlterTable: add observedRepositories column
ALTER TABLE "GitHubInstallation" ADD COLUMN "observedRepositories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: existing installations observe all their current repos
UPDATE "GitHubInstallation" SET "observedRepositories" = "repositories";

-- Remove the default now that backfill is done
ALTER TABLE "GitHubInstallation" ALTER COLUMN "observedRepositories" DROP DEFAULT;

-- DropIndex: remove old unique constraint on installationId
DROP INDEX "GitHubInstallation_installationId_key";

-- CreateIndex: add index on installationId for webhook lookups
CREATE INDEX "GitHubInstallation_installationId_idx" ON "GitHubInstallation"("installationId");

-- CreateIndex: add compound unique constraint
CREATE UNIQUE INDEX "GitHubInstallation_installationId_workspaceId_key" ON "GitHubInstallation"("installationId", "workspaceId");
