import type { PrismaClient, WorkspaceSettings } from '@prisma/client';

export async function getWorkspaceSettings(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<WorkspaceSettings> {
  const existing = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  // Create on first access; upsert handles the race if two requests both see null
  return prisma.workspaceSettings.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });
}
