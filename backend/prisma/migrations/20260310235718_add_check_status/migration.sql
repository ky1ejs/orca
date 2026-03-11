-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'NEUTRAL', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED');

-- AlterTable
ALTER TABLE "PullRequest" ADD COLUMN     "checkStatus" "CheckStatus",
ADD COLUMN     "headSha" TEXT;
