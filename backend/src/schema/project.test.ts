import { describe, expect, it, vi } from 'vitest';
import { projectResolvers } from './project.js';

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
    },
    pubsub: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
  };
}

describe('project resolvers', () => {
  describe('Query', () => {
    it('projects returns all projects ordered by createdAt desc', async () => {
      const ctx = createMockContext();
      const projects = [{ id: '1', name: 'Test' }];
      ctx.prisma.project.findMany.mockResolvedValue(projects);

      const result = await projectResolvers.Query.projects(null, {}, ctx as never);
      expect(result).toEqual(projects);
      expect(ctx.prisma.project.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('project returns a single project by id', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'Test' };
      ctx.prisma.project.findUnique.mockResolvedValue(project);

      const result = await projectResolvers.Query.project(null, { id: '1' }, ctx as never);
      expect(result).toEqual(project);
      expect(ctx.prisma.project.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });

  describe('Mutation', () => {
    it('createProject creates and publishes', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'New Project' };
      ctx.prisma.project.create.mockResolvedValue(project);

      const result = await projectResolvers.Mutation.createProject(
        null,
        { input: { name: 'New Project' } },
        ctx as never,
      );
      expect(result).toEqual(project);
      expect(ctx.prisma.project.create).toHaveBeenCalledWith({
        data: { name: 'New Project', description: undefined },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('projectChanged', project);
    });

    it('updateProject updates and publishes', async () => {
      const ctx = createMockContext();
      const project = { id: '1', name: 'Updated' };
      ctx.prisma.project.update.mockResolvedValue(project);

      const result = await projectResolvers.Mutation.updateProject(
        null,
        { id: '1', input: { name: 'Updated' } },
        ctx as never,
      );
      expect(result).toEqual(project);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('projectChanged', project);
    });

    it('deleteProject deletes and returns true', async () => {
      const ctx = createMockContext();
      ctx.prisma.project.delete.mockResolvedValue({});

      const result = await projectResolvers.Mutation.deleteProject(null, { id: '1' }, ctx as never);
      expect(result).toBe(true);
      expect(ctx.prisma.project.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });

  describe('Project', () => {
    it('tasks resolves project tasks', async () => {
      const ctx = createMockContext();
      const tasks = [{ id: '1', title: 'Task 1' }];
      ctx.prisma.task.findMany.mockResolvedValue(tasks);

      const result = await projectResolvers.Project.tasks({ id: 'p1' }, {}, ctx as never);
      expect(result).toEqual(tasks);
      expect(ctx.prisma.task.findMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } });
    });
  });
});
