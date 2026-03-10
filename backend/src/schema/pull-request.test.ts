import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PullRequestStatus } from '@prisma/client';
import { pullRequestMutationResolvers } from './pull-request.js';

vi.mock('../webhooks/github-api.js', () => ({
  getInstallationAccessToken: vi.fn().mockResolvedValue('ghs_test_token'),
  fetchPullRequest: vi.fn().mockResolvedValue({
    id: 99999,
    number: 42,
    title: 'Fix the thing',
    html_url: 'https://github.com/acme/repo/pull/42',
    state: 'open',
    draft: false,
    merged: false,
    head: { ref: 'fix/the-thing' },
    user: { login: 'octocat' },
  }),
}));

const TASK = {
  id: 'task-1',
  workspaceId: 'ws-1',
  title: 'Test Task',
  status: 'TODO',
  displayId: 'ORCA-1',
};

const MEMBERSHIP = {
  id: 'mem-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
  role: 'OWNER' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const WORKSPACE = {
  id: 'ws-1',
  deletedAt: null,
};

function createMockContext() {
  return {
    prisma: {
      task: {
        findUnique: vi.fn().mockResolvedValue(TASK),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue(WORKSPACE),
      },
      workspaceMembership: {
        findUnique: vi.fn().mockResolvedValue(MEMBERSHIP),
      },
      gitHubInstallation: {
        findFirst: vi.fn().mockResolvedValue({ installationId: 12345 }),
      },
      pullRequest: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
    },
    userId: 'user-1',
  };
}

describe('pull-request mutation resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('linkPullRequest', () => {
    it('parses a valid PR URL and creates a pull request record', async () => {
      const ctx = createMockContext();
      const expected = {
        id: 'pr-1',
        githubId: 99999,
        number: 42,
        title: 'Fix the thing',
        url: 'https://github.com/acme/repo/pull/42',
        status: PullRequestStatus.OPEN,
        repository: 'acme/repo',
        headBranch: 'fix/the-thing',
        author: 'octocat',
        draft: false,
        taskId: 'task-1',
        workspaceId: 'ws-1',
      };
      ctx.prisma.pullRequest.upsert.mockResolvedValue(expected);

      const result = await pullRequestMutationResolvers.linkPullRequest(
        {} as never,
        { input: { taskId: 'task-1', url: 'https://github.com/acme/repo/pull/42' } },
        ctx as never,
      );

      expect(result).toEqual(expected);
      expect(ctx.prisma.pullRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { githubId: 99999 },
          create: expect.objectContaining({
            githubId: 99999,
            number: 42,
            title: 'Fix the thing',
            repository: 'acme/repo',
            taskId: 'task-1',
          }),
        }),
      );
    });

    it('rejects an invalid PR URL', async () => {
      const ctx = createMockContext();

      await expect(
        pullRequestMutationResolvers.linkPullRequest(
          {} as never,
          { input: { taskId: 'task-1', url: 'https://example.com/not-a-pr' } },
          ctx as never,
        ),
      ).rejects.toThrow('Invalid GitHub PR URL');
    });

    it('accepts a trailing-slash PR URL', async () => {
      const ctx = createMockContext();
      ctx.prisma.pullRequest.upsert.mockResolvedValue({ id: 'pr-1' });

      await pullRequestMutationResolvers.linkPullRequest(
        {} as never,
        { input: { taskId: 'task-1', url: 'https://github.com/acme/repo/pull/42/' } },
        ctx as never,
      );

      expect(ctx.prisma.pullRequest.upsert).toHaveBeenCalled();
    });

    it('falls back to unauthenticated when no installation exists', async () => {
      const ctx = createMockContext();
      ctx.prisma.gitHubInstallation.findFirst.mockResolvedValue(null);
      ctx.prisma.pullRequest.upsert.mockResolvedValue({ id: 'pr-1' });

      const { fetchPullRequest } = await import('../webhooks/github-api.js');

      await pullRequestMutationResolvers.linkPullRequest(
        {} as never,
        { input: { taskId: 'task-1', url: 'https://github.com/acme/repo/pull/42' } },
        ctx as never,
      );

      expect(fetchPullRequest).toHaveBeenCalledWith('acme', 'repo', 42, undefined);
    });

    it('rejects when user lacks workspace access', async () => {
      const ctx = createMockContext();
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        pullRequestMutationResolvers.linkPullRequest(
          {} as never,
          { input: { taskId: 'task-1', url: 'https://github.com/acme/repo/pull/42' } },
          ctx as never,
        ),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('unlinkPullRequest', () => {
    it('deletes the pull request record', async () => {
      const ctx = createMockContext();
      ctx.prisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        taskId: 'task-1',
      });
      ctx.prisma.pullRequest.delete.mockResolvedValue({});

      const result = await pullRequestMutationResolvers.unlinkPullRequest(
        {} as never,
        { id: 'pr-1' },
        ctx as never,
      );

      expect(result).toBe(true);
      expect(ctx.prisma.pullRequest.delete).toHaveBeenCalledWith({ where: { id: 'pr-1' } });
    });

    it('throws when PR is not found', async () => {
      const ctx = createMockContext();
      ctx.prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(
        pullRequestMutationResolvers.unlinkPullRequest(
          {} as never,
          { id: 'pr-missing' },
          ctx as never,
        ),
      ).rejects.toThrow('Pull request not found');
    });

    it('rejects when user lacks workspace access for the PR task', async () => {
      const ctx = createMockContext();
      ctx.prisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        taskId: 'task-1',
      });
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        pullRequestMutationResolvers.unlinkPullRequest({} as never, { id: 'pr-1' }, ctx as never),
      ).rejects.toThrow('Task not found');
    });
  });
});
