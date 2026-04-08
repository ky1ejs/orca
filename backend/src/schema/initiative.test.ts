import { describe, expect, it, vi } from 'vitest';
import { initiativeResolvers } from './initiative.js';

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
      initiative: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      project: {
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
    loaders: {
      projectsByInitiativeId: { load: vi.fn().mockResolvedValue([]), clear: vi.fn() },
      workspaceById: { load: vi.fn().mockResolvedValue(WORKSPACE), clear: vi.fn() },
      tasksByProjectId: { load: vi.fn(), clear: vi.fn() },
      projectById: { load: vi.fn(), clear: vi.fn() },
      initiativeById: { load: vi.fn(), clear: vi.fn() },
      userById: { load: vi.fn(), clear: vi.fn() },
      labelsByTaskId: { load: vi.fn(), clear: vi.fn() },
      pullRequestsByTaskId: { load: vi.fn(), clear: vi.fn() },
    },
    pubsub: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
    userId: 'user1',
  };
}

describe('initiative resolvers', () => {
  describe('Query', () => {
    it('initiative returns a single initiative by id', async () => {
      const ctx = createMockContext();
      const initiative = {
        id: 'init1',
        name: 'Q1 Goals',
        workspaceId: 'ws1',
        workspace: WORKSPACE,
      };
      ctx.prisma.initiative.findUnique.mockResolvedValue(initiative);

      const result = await initiativeResolvers.Query.initiative(
        {} as never,
        { id: 'init1' },
        ctx as never,
      );
      expect(result).toEqual(initiative);
    });

    it('initiative throws NOT_FOUND for non-member', async () => {
      const ctx = createMockContext();
      const initiative = {
        id: 'init1',
        name: 'Q1 Goals',
        workspaceId: 'ws1',
        workspace: WORKSPACE,
      };
      ctx.prisma.initiative.findUnique.mockResolvedValue(initiative);
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        initiativeResolvers.Query.initiative({} as never, { id: 'init1' }, ctx as never),
      ).rejects.toThrow('Initiative not found');
    });
  });

  describe('Mutation', () => {
    it('createInitiative creates and publishes', async () => {
      const ctx = createMockContext();
      const initiative = { id: 'init1', name: 'Q1 Goals', workspaceId: 'ws1' };
      ctx.prisma.initiative.create.mockResolvedValue(initiative);

      const result = await initiativeResolvers.Mutation.createInitiative(
        {} as never,
        { input: { name: 'Q1 Goals', workspaceId: 'ws1' } },
        ctx as never,
      );
      expect(result).toEqual(initiative);
      expect(ctx.prisma.initiative.create).toHaveBeenCalledWith({
        data: {
          name: 'Q1 Goals',
          description: undefined,
          workspaceId: 'ws1',
        },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('initiativeChanged', initiative);
    });

    it('updateInitiative updates name and publishes', async () => {
      const ctx = createMockContext();
      const initiative = {
        id: 'init1',
        name: 'Updated',
        workspaceId: 'ws1',
        workspace: WORKSPACE,
      };
      ctx.prisma.initiative.findUnique.mockResolvedValue(initiative);
      ctx.prisma.initiative.update.mockResolvedValue(initiative);

      const result = await initiativeResolvers.Mutation.updateInitiative(
        {} as never,
        { id: 'init1', input: { name: 'Updated' } },
        ctx as never,
      );
      expect(result).toEqual(initiative);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('initiativeChanged', initiative);
    });

    it('archiveInitiative sets archivedAt and publishes', async () => {
      const ctx = createMockContext();
      const initiative = {
        id: 'init1',
        name: 'Q1 Goals',
        workspaceId: 'ws1',
        workspace: WORKSPACE,
      };
      const archivedInitiative = { ...initiative, archivedAt: new Date() };
      ctx.prisma.initiative.findUnique.mockResolvedValue(initiative);
      ctx.prisma.initiative.update.mockResolvedValue(archivedInitiative);

      const result = await initiativeResolvers.Mutation.archiveInitiative(
        {} as never,
        { id: 'init1' },
        ctx as never,
      );
      expect(result).toEqual(archivedInitiative);
      expect(ctx.prisma.initiative.update).toHaveBeenCalledWith({
        where: { id: 'init1' },
        data: { archivedAt: expect.any(Date) },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('initiativeChanged', archivedInitiative);
    });
  });

  describe('Initiative', () => {
    it('projects resolves non-archived initiative projects', async () => {
      const ctx = createMockContext();
      const projects = [{ id: 'p1', name: 'Project 1' }];
      ctx.loaders.projectsByInitiativeId.load.mockResolvedValue(projects);

      const result = await initiativeResolvers.Initiative.projects(
        { id: 'init1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(projects);
      expect(ctx.loaders.projectsByInitiativeId.load).toHaveBeenCalledWith('init1');
    });

    it('workspace resolves parent workspace', async () => {
      const ctx = createMockContext();

      const result = await initiativeResolvers.Initiative.workspace(
        { workspaceId: 'ws1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(WORKSPACE);
      expect(ctx.loaders.workspaceById.load).toHaveBeenCalledWith('ws1');
    });
  });

  describe('Subscription', () => {
    it('initiativeChanged.resolve clears stale projects loader entry for the initiative', () => {
      const ctx = createMockContext();
      const payload = { id: 'init1', workspaceId: 'ws1' };

      const result = initiativeResolvers.Subscription.initiativeChanged.resolve(
        payload as never,
        {} as never,
        ctx as never,
      );

      expect(ctx.loaders.projectsByInitiativeId.clear).toHaveBeenCalledWith('init1');
      expect(result).toBe(payload);
    });
  });
});
