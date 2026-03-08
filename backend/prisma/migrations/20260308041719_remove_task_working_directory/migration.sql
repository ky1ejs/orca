/*
  Warnings:

  - You are about to drop the column `workingDirectory` on the `Task` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultDirectory" TEXT;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "workingDirectory";
