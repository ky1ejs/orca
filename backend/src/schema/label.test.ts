import { describe, expect, it, vi } from 'vitest';
import { labelResolvers } from './label.js';

const WORKSPACE = {
  id: 'ws1',
  name: 'Test',
  slug: 'test',
  taskCounter: 0,
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
  const prisma = {
    label: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn().mockResolvedValue(WORKSPACE),
    },
    workspaceMembership: {
      findUnique: vi.fn().mockResolvedValue(MEMBERSHIP),
    },
  };
  return {
    prisma,
    pubsub: { publish: vi.fn(), subscribe: vi.fn() },
    userId: 'user1',
  };
}

describe('label resolvers', () => {
  describe('Query', () => {
    it('labels returns labels for a workspace', async () => {
      const ctx = createMockContext();
      const labels = [
        { id: 'l1', name: 'Bug', color: '#FF0000', workspaceId: 'ws1' },
        { id: 'l2', name: 'Feature', color: '#00FF00', workspaceId: 'ws1' },
      ];
      ctx.prisma.label.findMany.mockResolvedValue(labels);

      const result = await labelResolvers.Query.labels(
        {} as never,
        { workspaceId: 'ws1' },
        ctx as never,
      );
      expect(result).toEqual(labels);
      expect(ctx.prisma.label.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws1' },
        orderBy: { name: 'asc' },
      });
    });

    it('labels throws for non-member', async () => {
      const ctx = createMockContext();
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        labelResolvers.Query.labels({} as never, { workspaceId: 'ws1' }, ctx as never),
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('Mutation', () => {
    it('createLabel creates a label', async () => {
      const ctx = createMockContext();
      const label = { id: 'l1', name: 'Bug', color: '#FF0000', workspaceId: 'ws1' };
      ctx.prisma.label.create.mockResolvedValue(label);

      const result = await labelResolvers.Mutation.createLabel(
        {} as never,
        { input: { name: 'Bug', color: '#FF0000', workspaceId: 'ws1' } },
        ctx as never,
      );
      expect(result).toEqual(label);
    });

    it('createLabel rejects empty name', async () => {
      const ctx = createMockContext();

      await expect(
        labelResolvers.Mutation.createLabel(
          {} as never,
          { input: { name: '  ', color: '#FF0000', workspaceId: 'ws1' } },
          ctx as never,
        ),
      ).rejects.toThrow('Label name cannot be empty');
    });

    it('createLabel rejects invalid color', async () => {
      const ctx = createMockContext();

      await expect(
        labelResolvers.Mutation.createLabel(
          {} as never,
          { input: { name: 'Bug', color: 'red', workspaceId: 'ws1' } },
          ctx as never,
        ),
      ).rejects.toThrow('Color must be a valid hex color');
    });

    it('createLabel handles duplicate name', async () => {
      const ctx = createMockContext();
      ctx.prisma.label.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(
        labelResolvers.Mutation.createLabel(
          {} as never,
          { input: { name: 'Bug', color: '#FF0000', workspaceId: 'ws1' } },
          ctx as never,
        ),
      ).rejects.toThrow('A label with this name already exists');
    });

    it('updateLabel performs partial update', async () => {
      const ctx = createMockContext();
      const label = { id: 'l1', name: 'Bug', color: '#FF0000', workspaceId: 'ws1' };
      const updated = { ...label, color: '#00FF00' };
      ctx.prisma.label.findUnique.mockResolvedValue(label);
      ctx.prisma.label.update.mockResolvedValue(updated);

      const result = await labelResolvers.Mutation.updateLabel(
        {} as never,
        { id: 'l1', input: { color: '#00FF00' } },
        ctx as never,
      );
      expect(result).toEqual(updated);
      expect(ctx.prisma.label.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { color: '#00FF00' },
      });
    });

    it('updateLabel handles duplicate name', async () => {
      const ctx = createMockContext();
      const label = { id: 'l1', name: 'Bug', color: '#FF0000', workspaceId: 'ws1' };
      ctx.prisma.label.findUnique.mockResolvedValue(label);
      ctx.prisma.label.update.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(
        labelResolvers.Mutation.updateLabel(
          {} as never,
          { id: 'l1', input: { name: 'Feature' } },
          ctx as never,
        ),
      ).rejects.toThrow('A label with this name already exists');
    });

    it('updateLabel throws for not found', async () => {
      const ctx = createMockContext();
      ctx.prisma.label.findUnique.mockResolvedValue(null);

      await expect(
        labelResolvers.Mutation.updateLabel(
          {} as never,
          { id: 'l999', input: { name: 'New' } },
          ctx as never,
        ),
      ).rejects.toThrow('Label not found');
    });

    it('deleteLabel deletes and returns true', async () => {
      const ctx = createMockContext();
      const label = { id: 'l1', name: 'Bug', color: '#FF0000', workspaceId: 'ws1' };
      ctx.prisma.label.findUnique.mockResolvedValue(label);
      ctx.prisma.label.delete.mockResolvedValue({});

      const result = await labelResolvers.Mutation.deleteLabel(
        {} as never,
        { id: 'l1' },
        ctx as never,
      );
      expect(result).toBe(true);
    });

    it('deleteLabel throws for not found', async () => {
      const ctx = createMockContext();
      ctx.prisma.label.findUnique.mockResolvedValue(null);

      await expect(
        labelResolvers.Mutation.deleteLabel({} as never, { id: 'l999' }, ctx as never),
      ).rejects.toThrow('Label not found');
    });
  });
});
