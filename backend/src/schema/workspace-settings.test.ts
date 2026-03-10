import { describe, expect, it, vi } from 'vitest';
import { workspaceSettingsResolvers } from './workspace-settings.js';

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

const MEMBERSHIP_OWNER = {
  id: 'mem1',
  workspaceId: 'ws1',
  userId: 'user1',
  role: 'OWNER' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockContext(role: 'OWNER' | 'MEMBER' = 'OWNER') {
  const membership = { ...MEMBERSHIP_OWNER, role };
  const prisma = {
    workspace: {
      findUnique: vi.fn().mockResolvedValue(WORKSPACE),
    },
    workspaceMembership: {
      findUnique: vi.fn().mockResolvedValue(membership),
    },
    workspaceSettings: {
      upsert: vi.fn(),
    },
  };
  return {
    prisma,
    pubsub: { publish: vi.fn(), subscribe: vi.fn() },
    userId: 'user1',
  };
}

describe('workspace settings resolvers', () => {
  describe('Mutation.updateWorkspaceSettings', () => {
    it('upserts settings for workspace owner', async () => {
      const ctx = createMockContext('OWNER');
      const settings = {
        id: 'ws-settings-1',
        workspaceId: 'ws1',
        autoCloseOnMerge: false,
        autoInReviewOnPrOpen: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      ctx.prisma.workspaceSettings.upsert.mockResolvedValue(settings);

      const result = await workspaceSettingsResolvers.Mutation.updateWorkspaceSettings(
        {} as never,
        {
          workspaceId: 'ws1',
          input: { autoCloseOnMerge: false, autoInReviewOnPrOpen: true },
        },
        ctx as never,
      );

      expect(result).toEqual(settings);
      expect(ctx.prisma.workspaceSettings.upsert).toHaveBeenCalledWith({
        where: { workspaceId: 'ws1' },
        create: {
          workspaceId: 'ws1',
          autoCloseOnMerge: false,
          autoInReviewOnPrOpen: true,
        },
        update: {
          autoCloseOnMerge: false,
          autoInReviewOnPrOpen: true,
        },
      });
    });

    it('rejects non-owner', async () => {
      const ctx = createMockContext('MEMBER');

      await expect(
        workspaceSettingsResolvers.Mutation.updateWorkspaceSettings(
          {} as never,
          {
            workspaceId: 'ws1',
            input: { autoCloseOnMerge: false },
          },
          ctx as never,
        ),
      ).rejects.toThrow('Workspace not found');
    });

    it('handles partial updates', async () => {
      const ctx = createMockContext('OWNER');
      const settings = {
        id: 'ws-settings-1',
        workspaceId: 'ws1',
        autoCloseOnMerge: true,
        autoInReviewOnPrOpen: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      ctx.prisma.workspaceSettings.upsert.mockResolvedValue(settings);

      await workspaceSettingsResolvers.Mutation.updateWorkspaceSettings(
        {} as never,
        {
          workspaceId: 'ws1',
          input: { autoInReviewOnPrOpen: true },
        },
        ctx as never,
      );

      expect(ctx.prisma.workspaceSettings.upsert).toHaveBeenCalledWith({
        where: { workspaceId: 'ws1' },
        create: {
          workspaceId: 'ws1',
          autoInReviewOnPrOpen: true,
        },
        update: {
          autoInReviewOnPrOpen: true,
        },
      });
    });
  });
});
