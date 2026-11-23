import { GraphQLError } from 'graphql';
import type {
  ApiKeyResolvers,
  MutationResolvers,
  QueryResolvers,
} from '../__generated__/graphql.js';
import { generateApiKey } from '../auth/api-key.js';
import { requireApiKeyOwner, requireWorkspaceOwner } from '../auth/workspace.js';

const MAX_API_KEY_NAME_LENGTH = 64;

function invalidInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

/**
 * API keys are managed by workspace owners only. A member who is not an
 * owner gets NOT_FOUND, the same as for a workspace they can't see.
 */
export const apiKeyResolvers = {
  Query: {
    apiKeys: async (_parent, args, context) => {
      await requireWorkspaceOwner(context.prisma, args.workspaceId, context.userId);
      return context.prisma.apiKey.findMany({
        where: { workspaceId: args.workspaceId },
        orderBy: { createdAt: 'desc' },
      });
    },
  } satisfies Pick<QueryResolvers, 'apiKeys'>,
  Mutation: {
    createApiKey: async (_parent, args, context) => {
      const { workspaceId, scopes } = args.input;
      await requireWorkspaceOwner(context.prisma, workspaceId, context.userId);

      const name = args.input.name.trim();
      if (!name) throw invalidInput('Name is required');
      if (name.length > MAX_API_KEY_NAME_LENGTH) {
        throw invalidInput(`Name must be at most ${MAX_API_KEY_NAME_LENGTH} characters`);
      }
      if (scopes.length === 0) throw invalidInput('Choose at least one scope');

      const { key, hashedKey, displayHint } = generateApiKey();
      const apiKey = await context.prisma.apiKey.create({
        data: {
          workspaceId,
          name,
          displayHint,
          hashedKey,
          scopes: [...new Set(scopes)],
          createdById: context.userId,
        },
      });
      return { apiKey, key };
    },

    revokeApiKey: async (_parent, args, context) => {
      const { apiKey } = await requireApiKeyOwner(context.prisma, args.id, context.userId);
      if (apiKey.revokedAt) return apiKey;

      // Only an active key is updated, so a concurrent revoke can't move
      // the revocation time forward.
      await context.prisma.apiKey.updateMany({
        where: { id: apiKey.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return context.prisma.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } });
    },
  } satisfies Pick<MutationResolvers, 'createApiKey' | 'revokeApiKey'>,
  ApiKey: {
    createdBy: (parent, _args, context) =>
      parent.createdById ? context.loaders.userById.load(parent.createdById) : null,
  } satisfies Pick<ApiKeyResolvers, 'createdBy'>,
};
