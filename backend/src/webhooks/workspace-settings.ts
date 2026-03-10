import type { PrismaClient, WorkspaceSettings } from '@prisma/client';

export async function getWorkspaceSettings(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<WorkspaceSettings> {
  return prisma.workspaceSettings.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });
}
