import { describe, expect, it, vi } from 'vitest';
import { taskResolvers } from './task.js';

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
        findUnique: vi.fn(),
      },
    },
    pubsub: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
  };
}

describe('task resolvers', () => {
  describe('Query', () => {
    it('tasks returns tasks for a project', async () => {
      const ctx = createMockContext();
      const tasks = [{ id: '1', title: 'Task 1' }];
      ctx.prisma.task.findMany.mockResolvedValue(tasks);

      const result = await taskResolvers.Query.tasks(null, { projectId: 'p1' }, ctx as never);
      expect(result).toEqual(tasks);
      expect(ctx.prisma.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('task returns a single task by id', async () => {
      const ctx = createMockContext();
      const task = { id: '1', title: 'Task 1' };
      ctx.prisma.task.findUnique.mockResolvedValue(task);

      const result = await taskResolvers.Query.task(null, { id: '1' }, ctx as never);
      expect(result).toEqual(task);
      expect(ctx.prisma.task.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });

  describe('Mutation', () => {
    it('createTask creates with default status and publishes', async () => {
      const ctx = createMockContext();
      const task = { id: '1', title: 'New Task', status: 'TODO', projectId: 'p1' };
      ctx.prisma.task.create.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.createTask(
        null,
        { input: { title: 'New Task', projectId: 'p1', workingDirectory: '/tmp/test' } },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.prisma.task.create).toHaveBeenCalledWith({
        data: {
          title: 'New Task',
          description: undefined,
          status: 'TODO',
          projectId: 'p1',
          workingDirectory: '/tmp/test',
        },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', task);
    });

    it('createTask creates with specified status', async () => {
      const ctx = createMockContext();
      const task = { id: '1', title: 'New Task', status: 'IN_PROGRESS', projectId: 'p1' };
      ctx.prisma.task.create.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.createTask(
        null,
        {
          input: {
            title: 'New Task',
            status: 'IN_PROGRESS',
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
          projectId: 'p1',
          workingDirectory: '/tmp/test',
        },
      });
    });

    it('updateTask updates and publishes', async () => {
      const ctx = createMockContext();
      const task = { id: '1', title: 'Updated', status: 'DONE' };
      ctx.prisma.task.update.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.updateTask(
        null,
        { id: '1', input: { title: 'Updated', status: 'DONE' } },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', task);
    });

    it('deleteTask deletes and returns true', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.delete.mockResolvedValue({});

      const result = await taskResolvers.Mutation.deleteTask(null, { id: '1' }, ctx as never);
      expect(result).toBe(true);
      expect(ctx.prisma.task.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });

  describe('Task', () => {
    it('project resolves the parent project', async () => {
      const ctx = createMockContext();
      const project = { id: 'p1', name: 'Project 1' };
      ctx.prisma.project.findUnique.mockResolvedValue(project);

      const result = await taskResolvers.Task.project({ projectId: 'p1' }, {}, ctx as never);
      expect(result).toEqual(project);
      expect(ctx.prisma.project.findUnique).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });
});
