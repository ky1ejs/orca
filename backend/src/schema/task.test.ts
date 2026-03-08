import { describe, expect, it, vi } from 'vitest';
import { TaskStatus } from '../__generated__/graphql.js';
import { taskResolvers } from './task.js';

const WORKSPACE = {
  id: 'ws1',
  name: 'Personal',
  slug: 'personal',
  createdById: 'user1',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROJECT = {
  id: 'p1',
  name: 'Test Project',
  workspaceId: 'ws1',
  workspace: WORKSPACE,
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
      task: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue(PROJECT),
        findUniqueOrThrow: vi.fn(),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue(WORKSPACE),
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

describe('task resolvers', () => {
  describe('Query', () => {
    it('task returns a single task by id with access check', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task 1',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);

      const result = await taskResolvers.Query.task({} as never, { id: '1' }, ctx as never);
      expect(result).toEqual(task);
      expect(ctx.prisma.task.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('task throws NOT_FOUND for non-member', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task 1',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        taskResolvers.Query.task({} as never, { id: '1' }, ctx as never),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('Mutation', () => {
    it('createTask creates with default status, workspaceId, and publishes', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'New Task',
        status: 'TODO',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.create.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.createTask(
        {} as never,
        { input: { title: 'New Task', projectId: 'p1', workingDirectory: '/tmp/test' } },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.prisma.task.create).toHaveBeenCalledWith({
        data: {
          title: 'New Task',
          description: undefined,
          status: 'TODO',
          priority: 'NONE',
          projectId: 'p1',
          workspaceId: 'ws1',
          workingDirectory: '/tmp/test',
        },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', task);
    });

    it('createTask creates with specified status', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'New Task',
        status: 'IN_PROGRESS',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.create.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.createTask(
        {} as never,
        {
          input: {
            title: 'New Task',
            status: TaskStatus.IN_PROGRESS,
            projectId: 'p1',
            workingDirectory: '/tmp/test',
          },
        },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.prisma.task.create).toHaveBeenCalledWith({
        data: {
          title: 'New Task',
          description: undefined,
          status: 'IN_PROGRESS',
          priority: 'NONE',
          projectId: 'p1',
          workspaceId: 'ws1',
          workingDirectory: '/tmp/test',
        },
      });
    });

    it('updateTask updates and publishes', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Updated',
        status: 'DONE',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.task.update.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.updateTask(
        {} as never,
        { id: '1', input: { title: 'Updated', status: TaskStatus.DONE } },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', task);
    });

    it('deleteTask deletes and returns true', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Test',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.task.delete.mockResolvedValue({});

      const result = await taskResolvers.Mutation.deleteTask(
        {} as never,
        { id: '1' },
        ctx as never,
      );
      expect(result).toBe(true);
    });
  });

  describe('Task', () => {
    it('project resolves the parent project', async () => {
      const ctx = createMockContext();
      const project = { id: 'p1', name: 'Project 1' };
      ctx.prisma.project.findUniqueOrThrow.mockResolvedValue(project);

      const result = await taskResolvers.Task.project(
        { projectId: 'p1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(project);
      expect(ctx.prisma.project.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });
});
