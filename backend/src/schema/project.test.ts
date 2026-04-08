import { describe, expect, it, vi } from 'vitest';
import { projectResolvers } from './project.js';

const WORKSPACE = {
  id: 'ws1',
  name: 'Personal',
  slug: 'personal',
  createdById: 'user1',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MEMBERSHIP = {
  id: 'mem1',
  workspaceId: 'ws1',
  userId: 'user1',
  role: 'OWNER' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const INITIATIVE = {
  id: 'init1',
  name: 'Test Initiative',
  workspaceId: 'ws1',
  workspace: WORKSPACE,
};

function createMockContext() {
  return {
    prisma: {
      project: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      task: {
        findMany: vi.fn(),
      },
      initiative: {
        findUnique: vi.fn().mockResolvedValue(INITIATIVE),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue(WORKSPACE),
        findUniqueOrThrow: vi.fn().mockResolvedValue(WORKSPACE),
      },
      workspaceMembership: {
        findUnique: vi.fn().mockResolvedValue(MEMBERSHIP),
      },
    },
    loaders: {
      tasksByProjectId: { load: vi.fn().mockResolvedValue([]), clear: vi.fn() },
      workspaceById: { load: vi.fn().mockResolvedValue(WORKSPACE), clear: vi.fn() },
      initiativeById: { load: vi.fn().mockResolvedValue(INITIATIVE), clear: vi.fn() },
      projectById: { load: vi.fn(), clear: vi.fn() },
      userById: { load: vi.fn(), clear: vi.fn() },
      labelsByTaskId: { load: vi.fn(), clear: vi.fn() },
      pullRequestsByTaskId: { load: vi.fn(), clear: vi.fn() },
      projectsByInitiativeId: { load: vi.fn(), clear: vi.fn() },
    },
    pubsub: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
    userId: 'user1',
  };
}

describe('project resolvers', () => {
  describe('Query', () => {
    it('project returns a single project by id with access check', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'Test', workspaceId: 'ws1', workspace: WORKSPACE };
      ctx.prisma.project.findUnique.mockResolvedValue(project);

      const result = await projectResolvers.Query.project({} as never, { id: '1' }, ctx as never);
      expect(result).toEqual(project);
      expect(ctx.prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { workspace: true },
      });
    });

    it('project throws NOT_FOUND for non-member', async () => {
      const ctx = createMockContext();
      const project = {
        id: '1',
        name: 'Test',
        workspaceId: 'ws1',
        workspace: WORKSPACE,
      };
      ctx.prisma.project.findUnique.mockResolvedValue(project);
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        projectResolvers.Query.project({} as never, { id: '1' }, ctx as never),
      ).rejects.toThrow('Project not found');
    });
  });

  describe('Mutation', () => {
    it('createProject creates with workspaceId and publishes', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'New Project', workspaceId: 'ws1' };
      ctx.prisma.project.create.mockResolvedValue(project);

      const result = await projectResolvers.Mutation.createProject(
        {} as never,
        { input: { name: 'New Project', workspaceId: 'ws1' } },
        ctx as never,
      );
      expect(result).toEqual(project);
      expect(ctx.prisma.project.create).toHaveBeenCalledWith({
        data: {
          name: 'New Project',
          description: undefined,
          defaultDirectory: null,
          workspaceId: 'ws1',
          initiativeId: null,
        },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('projectChanged', project);
    });

    it('createProject with initiativeId validates initiative belongs to workspace', async () => {
      const ctx = createMockContext();
      const project = {
        id: '1',
        name: 'New Project',
        workspaceId: 'ws1',
        initiativeId: 'init1',
      };
      ctx.prisma.project.create.mockResolvedValue(project);

      const result = await projectResolvers.Mutation.createProject(
        {} as never,
        { input: { name: 'New Project', workspaceId: 'ws1', initiativeId: 'init1' } },
        ctx as never,
      );
      expect(result).toEqual(project);
      expect(ctx.prisma.project.create).toHaveBeenCalledWith({
        data: {
          name: 'New Project',
          description: undefined,
          defaultDirectory: null,
          workspaceId: 'ws1',
          initiativeId: 'init1',
        },
      });
    });

    it('updateProject updates and publishes', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'Updated', workspaceId: 'ws1', workspace: WORKSPACE };
      ctx.prisma.project.findUnique.mockResolvedValue(project);
      ctx.prisma.project.update.mockResolvedValue(project);

      const result = await projectResolvers.Mutation.updateProject(
        {} as never,
        { id: '1', input: { name: 'Updated' } },
        ctx as never,
      );
      expect(result).toEqual(project);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('projectChanged', project);
    });

    it('archiveProject sets archivedAt and publishes', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'Test', workspaceId: 'ws1', workspace: WORKSPACE };
      const archivedProject = { ...project, archivedAt: new Date() };
      ctx.prisma.project.findUnique.mockResolvedValue(project);
      ctx.prisma.project.update.mockResolvedValue(archivedProject);

      const result = await projectResolvers.Mutation.archiveProject(
        {} as never,
        { id: '1' },
        ctx as never,
      );
      expect(result).toEqual(archivedProject);
      expect(ctx.prisma.project.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { archivedAt: expect.any(Date) },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('projectChanged', archivedProject);
    });
  });

  describe('Project', () => {
    it('tasks resolves non-archived project tasks', async () => {
      const ctx = createMockContext();
      const tasks = [{ id: '1', title: 'Task 1' }];
      ctx.loaders.tasksByProjectId.load.mockResolvedValue(tasks);

      const result = await projectResolvers.Project.tasks({ id: 'p1' } as never, {}, ctx as never);
      expect(result).toEqual(tasks);
      expect(ctx.loaders.tasksByProjectId.load).toHaveBeenCalledWith('p1');
    });

    it('workspace resolves parent workspace', async () => {
      const ctx = createMockContext();

      const result = await projectResolvers.Project.workspace(
        { workspaceId: 'ws1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(WORKSPACE);
      expect(ctx.loaders.workspaceById.load).toHaveBeenCalledWith('ws1');
    });

    it('initiative resolves parent initiative', async () => {
      const ctx = createMockContext();

      const result = await projectResolvers.Project.initiative!(
        { initiativeId: 'init1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(INITIATIVE);
      expect(ctx.loaders.initiativeById.load).toHaveBeenCalledWith('init1');
    });

    it('initiative resolves null when no initiativeId', async () => {
      const ctx = createMockContext();

      const result = await projectResolvers.Project.initiative!(
        { initiativeId: null } as never,
        {},
        ctx as never,
      );
      expect(result).toBeNull();
      expect(ctx.loaders.initiativeById.load).not.toHaveBeenCalled();
    });
  });

  describe('Subscription', () => {
    it('projectChanged.resolve clears stale tasks loader entry for the project', () => {
      const ctx = createMockContext();
      const payload = { id: 'p1', workspaceId: 'ws1' };

      const result = projectResolvers.Subscription.projectChanged.resolve(
        payload as never,
        {} as never,
        ctx as never,
      );

      expect(ctx.loaders.tasksByProjectId.clear).toHaveBeenCalledWith('p1');
      expect(result).toBe(payload);
    });
  });
});
