import { describe, expect, it, vi } from 'vitest';
import { githubInstallationResolvers } from './github-installation.js';

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

const INSTALLATION = {
  id: 'inst1',
  installationId: 123,
  accountLogin: 'test-org',
  accountType: 'Organization',
  workspaceId: 'ws1',
  repositories: ['org/repo-a', 'org/repo-b', 'org/repo-c'],
  observedRepositories: ['org/repo-a'],
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
    gitHubInstallation: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(INSTALLATION),
      update: vi.fn().mockResolvedValue(INSTALLATION),
    },
  };
  return {
    prisma,
    pubsub: { publish: vi.fn(), subscribe: vi.fn() },
    userId: 'user1',
  };
}

describe('github installation resolvers', () => {
  describe('Query.githubAppInstallUrl', () => {
    it('returns install URL with workspace ID as state', async () => {
      const ctx = createMockContext('MEMBER');
      const originalSlug = process.env.GITHUB_APP_SLUG;
      process.env.GITHUB_APP_SLUG = 'orca-test';

      try {
        const result = await githubInstallationResolvers.Query.githubAppInstallUrl(
          {} as never,
          { workspaceId: 'ws1' },
          ctx as never,
        );

        expect(result).toBe('https://github.com/apps/orca-test/installations/new?state=ws1');
      } finally {
        if (originalSlug !== undefined) {
          process.env.GITHUB_APP_SLUG = originalSlug;
        } else {
          delete process.env.GITHUB_APP_SLUG;
        }
      }
    });

    it('throws when GITHUB_APP_SLUG is not set', async () => {
      const ctx = createMockContext('MEMBER');
      const originalSlug = process.env.GITHUB_APP_SLUG;
      delete process.env.GITHUB_APP_SLUG;

      try {
        await expect(
          githubInstallationResolvers.Query.githubAppInstallUrl(
            {} as never,
            { workspaceId: 'ws1' },
            ctx as never,
          ),
        ).rejects.toThrow('GitHub App is not configured');
      } finally {
        if (originalSlug !== undefined) {
          process.env.GITHUB_APP_SLUG = originalSlug;
        }
      }
    });

    it('rejects non-member', async () => {
      const ctx = createMockContext('MEMBER');
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        githubInstallationResolvers.Query.githubAppInstallUrl(
          {} as never,
          { workspaceId: 'ws1' },
          ctx as never,
        ),
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('Mutation.removeGitHubInstallation', () => {
    it('deletes installation for workspace owner', async () => {
      const ctx = createMockContext('OWNER');
      ctx.prisma.gitHubInstallation.deleteMany.mockResolvedValue({ count: 1 });

      const result = await githubInstallationResolvers.Mutation.removeGitHubInstallation(
        {} as never,
        { workspaceId: 'ws1' },
        ctx as never,
      );

      expect(result).toBe(true);
      expect(ctx.prisma.gitHubInstallation.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws1' },
      });
    });

    it('rejects non-owner', async () => {
      const ctx = createMockContext('MEMBER');

      await expect(
        githubInstallationResolvers.Mutation.removeGitHubInstallation(
          {} as never,
          { workspaceId: 'ws1' },
          ctx as never,
        ),
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('Mutation.updateObservedRepositories', () => {
    it('updates observed repos with valid subset', async () => {
      const ctx = createMockContext('OWNER');
      const updated = { ...INSTALLATION, observedRepositories: ['org/repo-a', 'org/repo-b'] };
      ctx.prisma.gitHubInstallation.update.mockResolvedValue(updated);

      const result = await githubInstallationResolvers.Mutation.updateObservedRepositories(
        {} as never,
        { workspaceId: 'ws1', repositories: ['org/repo-a', 'org/repo-b'] },
        ctx as never,
      );

      expect(result).toEqual(updated);
      expect(ctx.prisma.gitHubInstallation.update).toHaveBeenCalledWith({
        where: { id: 'inst1' },
        data: { observedRepositories: ['org/repo-a', 'org/repo-b'] },
      });
    });

    it('rejects repos not in the installation', async () => {
      const ctx = createMockContext('OWNER');

      await expect(
        githubInstallationResolvers.Mutation.updateObservedRepositories(
          {} as never,
          { workspaceId: 'ws1', repositories: ['org/repo-a', 'org/not-installed'] },
          ctx as never,
        ),
      ).rejects.toThrow('Repositories not available in this installation: org/not-installed');
    });

    it('rejects non-owner', async () => {
      const ctx = createMockContext('MEMBER');

      await expect(
        githubInstallationResolvers.Mutation.updateObservedRepositories(
          {} as never,
          { workspaceId: 'ws1', repositories: ['org/repo-a'] },
          ctx as never,
        ),
      ).rejects.toThrow('Workspace not found');
    });

    it('throws when no installation exists', async () => {
      const ctx = createMockContext('OWNER');
      ctx.prisma.gitHubInstallation.findFirst.mockResolvedValue(null);

      await expect(
        githubInstallationResolvers.Mutation.updateObservedRepositories(
          {} as never,
          { workspaceId: 'ws1', repositories: ['org/repo-a'] },
          ctx as never,
        ),
      ).rejects.toThrow('No GitHub installation found for this workspace');
    });
  });
});
