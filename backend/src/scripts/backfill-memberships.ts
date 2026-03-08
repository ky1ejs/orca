import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
  // Step 1: Create OWNER memberships for all workspace creators
  const workspaces = await prisma.workspace.findMany({
    where: { deletedAt: null },
    select: { id: true, createdById: true },
  });

  let membershipsCreated = 0;
  for (const ws of workspaces) {
    const existing = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: ws.createdById } },
    });
    if (!existing) {
      await prisma.workspaceMembership.create({
        data: {
          workspaceId: ws.id,
          userId: ws.createdById,
          role: 'OWNER',
        },
      });
      membershipsCreated++;
    }
  }
  console.log(`Created ${membershipsCreated} OWNER memberships`);

  // Step 2: Backfill workspaceId on tasks
  const tasksWithoutWorkspace = await prisma.task.findMany({
    where: { workspaceId: null as unknown as string },
    include: { project: { select: { workspaceId: true, id: true } } },
  });

  let tasksUpdated = 0;
  let tasksSkipped = 0;
  for (const task of tasksWithoutWorkspace) {
    if (!task.project || !task.project.workspaceId) {
      console.warn(
        `SKIP: Task ${task.id} has no project or project has no workspaceId (project: ${task.project?.id ?? 'null'})`,
      );
      tasksSkipped++;
      continue;
    }
    await prisma.task.update({
      where: { id: task.id },
      data: { workspaceId: task.project.workspaceId },
    });
    tasksUpdated++;
  }
  console.log(`Backfilled workspaceId on ${tasksUpdated} tasks (${tasksSkipped} skipped)`);

  // Verify: no memberships missing
  const workspacesWithoutOwner = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      memberships: { none: { role: 'OWNER' } },
    },
  });
  if (workspacesWithoutOwner.length > 0) {
    console.error(`ERROR: ${workspacesWithoutOwner.length} workspaces have no OWNER membership`);
    process.exit(1);
  }

  console.log('Backfill complete. Safe to proceed with NOT NULL migration.');
}

backfill()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
