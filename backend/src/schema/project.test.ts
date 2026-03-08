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

function createMockContext() {
  return {
    prisma: {
      project: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      task: {
        findMany: vi.fn(),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue(WORKSPACE),
        findUniqueOrThrow: vi.fn().mockResolvedValue(WORKSPACE),
      },
      workspaceMembership: {
        findUnique: vi.fn().mockResolvedValue(MEMBERSHIP),
      },
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
        data: { name: 'New Project', description: undefined, workspaceId: 'ws1' },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('projectChanged', project);
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

    it('deleteProject deletes and returns true', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'Test', workspaceId: 'ws1', workspace: WORKSPACE };
      ctx.prisma.project.findUnique.mockResolvedValue(project);
      ctx.prisma.project.delete.mockResolvedValue({});

      const result = await projectResolvers.Mutation.deleteProject(
        {} as never,
        { id: '1' },
        ctx as never,
      );
      expect(result).toBe(true);
    });
  });

  describe('Project', () => {
    it('tasks resolves project tasks', async () => {
      const ctx = createMockContext();
      const tasks = [{ id: '1', title: 'Task 1' }];
      ctx.prisma.task.findMany.mockResolvedValue(tasks);

      const result = await projectResolvers.Project.tasks({ id: 'p1' } as never, {}, ctx as never);
      expect(result).toEqual(tasks);
      expect(ctx.prisma.task.findMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } });
    });

    it('workspace resolves parent workspace', async () => {
      const ctx = createMockContext();

      const result = await projectResolvers.Project.workspace(
        { workspaceId: 'ws1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(WORKSPACE);
      expect(ctx.prisma.workspace.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'ws1' },
      });
    });
  });
});
