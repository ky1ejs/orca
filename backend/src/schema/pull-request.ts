import { PullRequestStatus } from '@prisma/client';
import type { TaskResolvers } from '../__generated__/graphql.js';

export const pullRequestFieldResolvers = {
  pullRequests: (parent, _args, context) => {
    return context.prisma.pullRequest.findMany({
      where: { taskId: parent.id },
      orderBy: { createdAt: 'desc' },
    });
  },
  pullRequestCount: (parent, _args, context) => {
    return context.prisma.pullRequest.count({
      where: { taskId: parent.id, status: PullRequestStatus.OPEN },
    });
  },
} satisfies Pick<TaskResolvers, 'pullRequests' | 'pullRequestCount'>;
