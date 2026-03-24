import DataLoader from 'dataloader';
import type { PrismaClient } from '@prisma/client';

function byId<T extends { id: string }>(
  fetch: (ids: readonly string[]) => Promise<T[]>,
): DataLoader<string, T | null> {
  return new DataLoader(async (ids) => {
    const rows = await fetch(ids);
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  });
}

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

export function createLoaders(prisma: PrismaClient) {
  return {
    userById: byId((ids) => prisma.user.findMany({ where: { id: { in: [...ids] } } })),
    projectById: byId((ids) => prisma.project.findMany({ where: { id: { in: [...ids] } } })),
    initiativeById: byId((ids) =>
      prisma.initiative.findMany({ where: { id: { in: [...ids] } } }),
    ),
    workspaceById: byId((ids) => prisma.workspace.findMany({ where: { id: { in: [...ids] } } })),

    labelsByTaskId: new DataLoader(async (taskIds: readonly string[]) => {
      const tasks = await prisma.task.findMany({
        where: { id: { in: [...taskIds] } },
        include: { labels: true },
      });
      const map = new Map(tasks.map((t) => [t.id, t.labels]));
      return taskIds.map((id) => map.get(id) ?? []);
    }),

    pullRequestsByTaskId: new DataLoader(async (taskIds: readonly string[]) => {
      const prs = await prisma.pullRequest.findMany({
        where: { taskId: { in: [...taskIds] } },
        orderBy: { createdAt: 'desc' },
      });
      const grouped = groupBy(prs, (pr) => pr.taskId);
      return taskIds.map((id) => grouped.get(id) ?? []);
    }),

    tasksByProjectId: new DataLoader(async (projectIds: readonly string[]) => {
      const tasks = await prisma.task.findMany({
        where: { projectId: { in: [...projectIds] }, archivedAt: null },
      });
      const grouped = groupBy(tasks, (t) => t.projectId);
      return projectIds.map((id) => grouped.get(id) ?? []);
    }),

    projectsByInitiativeId: new DataLoader(async (initiativeIds: readonly string[]) => {
      const projects = await prisma.project.findMany({
        where: { initiativeId: { in: [...initiativeIds] }, archivedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const grouped = groupBy(projects, (p) => p.initiativeId);
      return initiativeIds.map((id) => grouped.get(id) ?? []);
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
