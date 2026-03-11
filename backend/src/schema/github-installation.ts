import { GraphQLError } from 'graphql';
import type { QueryResolvers, MutationResolvers } from '../__generated__/graphql.js';
import { requireWorkspaceAccess, requireWorkspaceOwner } from '../auth/workspace.js';
import { getInstallationDetails, getInstallationRepositories } from '../webhooks/github-api.js';
import { createOAuthState } from '../auth/oauth-state.js';

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
    githubOAuthUrl: async (_parent, args, context) => {
      await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);

      const clientId = process.env.GITHUB_APP_CLIENT_ID;
      if (!clientId) {
        throw new GraphQLError('GitHub OAuth is not configured', {
          extensions: { code: 'BAD_REQUEST' },
        });
      }

      const state = await createOAuthState(args.workspaceId);
      return `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}`;
    },
  } satisfies Pick<QueryResolvers, 'githubAppInstallUrl' | 'githubOAuthUrl'>,
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

      return context.prisma.gitHubInstallation.upsert({
        where: {
          installationId_workspaceId: {
            installationId: args.installationId,
            workspaceId: args.workspaceId,
          },
        },
        create: {
          installationId: args.installationId,
          accountLogin: details.account.login,
          accountType: details.account.type,
          repositories,
          observedRepositories: [],
          workspaceId: args.workspaceId,
        },
        update: {
          accountLogin: details.account.login,
          accountType: details.account.type,
          repositories,
        },
      });
    },
    removeGitHubInstallation: async (_parent, args, context) => {
      await requireWorkspaceOwner(context.prisma, args.workspaceId, context.userId);

      await context.prisma.gitHubInstallation.deleteMany({
        where: { workspaceId: args.workspaceId },
      });

      return true;
    },
    updateObservedRepositories: async (_parent, args, context) => {
      await requireWorkspaceOwner(context.prisma, args.workspaceId, context.userId);

      const installation = await context.prisma.gitHubInstallation.findFirst({
        where: { workspaceId: args.workspaceId },
      });

      if (!installation) {
        throw new GraphQLError('No GitHub installation found for this workspace', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const invalid = args.repositories.filter((r) => !installation.repositories.includes(r));
      if (invalid.length > 0) {
        throw new GraphQLError(
          `Repositories not available in this installation: ${invalid.join(', ')}`,
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      return context.prisma.gitHubInstallation.update({
        where: { id: installation.id },
        data: { observedRepositories: args.repositories },
      });
    },
  } satisfies Pick<
    MutationResolvers,
    'completeGitHubInstallation' | 'removeGitHubInstallation' | 'updateObservedRepositories'
  >,
};
