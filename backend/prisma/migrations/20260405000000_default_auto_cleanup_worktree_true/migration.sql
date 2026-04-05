-- Enable auto-cleanup for all existing workspaces (new default is true)
UPDATE "WorkspaceSettings" SET "autoCleanupWorktree" = true;

-- AlterTable: change column default from false to true
ALTER TABLE "WorkspaceSettings" ALTER COLUMN "autoCleanupWorktree" SET DEFAULT true;
