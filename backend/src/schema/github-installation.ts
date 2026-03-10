import { GraphQLError } from 'graphql';
import type { QueryResolvers, MutationResolvers } from '../__generated__/graphql.js';
import { requireWorkspaceAccess, requireWorkspaceOwner } from '../auth/workspace.js';
import { getInstallationDetails, getInstallationRepositories } from '../webhooks/github-api.js';

export const githubInstallationResolvers = {
  Query: {
    githubAppInstallUrl: async (_parent, args, context) => {
      await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);

      const slug = process.env.GITHUB_APP_SLUG;
      if (!slug) {
        throw new GraphQLError('GitHub App is not configured', {
          extensions: { code: 'BAD_REQUEST' },
        });
      }

      return `https://github.com/apps/${slug}/installations/new?state=${args.workspaceId}`;
    },
  } satisfies Pick<QueryResolvers, 'githubAppInstallUrl'>,
  Mutation: {
    completeGitHubInstallation: async (_parent, args, context) => {
      await requireWorkspaceOwner(context.prisma, args.workspaceId, context.userId);

      const details = await getInstallationDetails(args.installationId);
      let repositories: string[] = [];
      try {
        repositories = await getInstallationRepositories(args.installationId);
      } catch {
        // Non-critical — repos can be fetched later
      }

      const data = {
        accountLogin: details.account.login,
        accountType: details.account.type,
        repositories,
        workspaceId: args.workspaceId,
      };

      return context.prisma.gitHubInstallation.upsert({
        where: { installationId: args.installationId },
        create: { installationId: args.installationId, ...data },
        update: data,
      });
    },
    removeGitHubInstallation: async (_parent, args, context) => {
      await requireWorkspaceOwner(context.prisma, args.workspaceId, context.userId);

      await context.prisma.gitHubInstallation.deleteMany({
        where: { workspaceId: args.workspaceId },
      });

      return true;
    },
  } satisfies Pick<MutationResolvers, 'completeGitHubInstallation' | 'removeGitHubInstallation'>,
};
