import { PullRequestStatus } from '@prisma/client';
import { GraphQLError } from 'graphql';
import type { MutationResolvers, TaskResolvers } from '../__generated__/graphql.js';
import { requireTaskAccess } from '../auth/workspace.js';
import {
  fetchCombinedCheckStatus,
  fetchPullRequest,
  getInstallationAccessToken,
} from '../webhooks/github-api.js';

export const pullRequestFieldResolvers = {
  pullRequests: (parent, _args, context) => {
    return context.loaders.pullRequestsByTaskId.load(parent.id);
  },
  pullRequestCount: async (parent, _args, context) => {
    const prs = await context.loaders.pullRequestsByTaskId.load(parent.id);
    return prs.filter((pr) => pr.status === PullRequestStatus.OPEN).length;
  },
} satisfies Pick<TaskResolvers, 'pullRequests' | 'pullRequestCount'>;

const PR_URL_REGEX = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

function parsePrUrl(url: string): { owner: string; repo: string; number: number } {
  const match = url.trim().match(PR_URL_REGEX);
  if (!match) {
    throw new GraphQLError(
      'Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/123',
      {
        extensions: { code: 'BAD_USER_INPUT' },
      },
    );
  }
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

export const pullRequestMutationResolvers = {
  linkPullRequest: async (_parent, args, context) => {
    const { taskId, url } = args.input;
    const { task } = await requireTaskAccess(context.prisma, taskId, context.userId);
    const { owner, repo, number } = parsePrUrl(url);

    // Try to get an installation token for the workspace (private repo support)
    let token: string | undefined;
    const installation = await context.prisma.gitHubInstallation.findFirst({
      where: { workspaceId: task.workspaceId },
    });
    if (installation) {
      try {
        token = await getInstallationAccessToken(installation.installationId);
      } catch {
        // Fall back to unauthenticated access
      }
    }

    const pr = await fetchPullRequest(owner, repo, number, token);

    const status = pr.merged
      ? PullRequestStatus.MERGED
      : pr.state === 'closed'
        ? PullRequestStatus.CLOSED
        : PullRequestStatus.OPEN;

    // Fetch CI check status for the PR's head SHA
    let checkStatus = null;
    try {
      checkStatus = await fetchCombinedCheckStatus(owner, repo, pr.head.sha, token);
    } catch {
      // Non-critical — proceed without check status
    }

    const prData = {
      title: pr.title,
      url: pr.html_url,
      status,
      repository: `${owner}/${repo}`,
      headBranch: pr.head.ref,
      headSha: pr.head.sha,
      author: pr.user.login,
      draft: pr.draft,
      checkStatus,
      taskId,
      workspaceId: task.workspaceId,
    };

    return context.prisma.pullRequest.upsert({
      where: { githubId: pr.id },
      create: { githubId: pr.id, number: pr.number, ...prData },
      update: prData,
    });
  },
  unlinkPullRequest: async (_parent, args, context) => {
    const pr = await context.prisma.pullRequest.findUnique({
      where: { id: args.id },
    });
    if (!pr) {
      throw new GraphQLError('Pull request not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    await requireTaskAccess(context.prisma, pr.taskId, context.userId);
    await context.prisma.pullRequest.delete({ where: { id: args.id } });
    return true;
  },
} satisfies Pick<MutationResolvers, 'linkPullRequest' | 'unlinkPullRequest'>;
