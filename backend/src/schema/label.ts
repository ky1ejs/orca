import { GraphQLError } from 'graphql';
import type {
  QueryResolvers,
  MutationResolvers,
  LabelResolvers,
} from '../__generated__/graphql.js';
import { requireWorkspaceAccess } from '../auth/workspace.js';

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const labelResolvers = {
  Query: {
    labels: async (_parent, args, context) => {
      await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
      return context.prisma.label.findMany({
        where: { workspaceId: args.workspaceId },
        orderBy: { name: 'asc' },
      });
    },
  } satisfies Pick<QueryResolvers, 'labels'>,
  Mutation: {
    createLabel: async (_parent, args, context) => {
      await requireWorkspaceAccess(context.prisma, args.input.workspaceId, context.userId);

      const name = args.input.name.trim();
      if (!name) {
        throw new GraphQLError('Label name cannot be empty', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (!COLOR_PATTERN.test(args.input.color)) {
        throw new GraphQLError('Color must be a valid hex color (e.g. #FF5733)', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await context.prisma.label.create({
          data: {
            name,
            color: args.input.color,
            workspaceId: args.input.workspaceId,
          },
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('Unique constraint failed')) {
          throw new GraphQLError('A label with this name already exists in this workspace', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        throw e;
      }
    },
    updateLabel: async (_parent, args, context) => {
      const label = await context.prisma.label.findUnique({ where: { id: args.id } });
      if (!label) {
        throw new GraphQLError('Label not found', { extensions: { code: 'NOT_FOUND' } });
      }

      await requireWorkspaceAccess(context.prisma, label.workspaceId, context.userId);

      const data: Record<string, unknown> = {};
      if (args.input.name != null) {
        const name = args.input.name.trim();
        if (!name) {
          throw new GraphQLError('Label name cannot be empty', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        data.name = name;
      }
      if (args.input.color != null) {
        if (!COLOR_PATTERN.test(args.input.color)) {
          throw new GraphQLError('Color must be a valid hex color (e.g. #FF5733)', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        data.color = args.input.color;
      }

      try {
        return await context.prisma.label.update({ where: { id: args.id }, data });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('Unique constraint failed')) {
          throw new GraphQLError('A label with this name already exists in this workspace', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        throw e;
      }
    },
    deleteLabel: async (_parent, args, context) => {
      const label = await context.prisma.label.findUnique({ where: { id: args.id } });
      if (!label) {
        throw new GraphQLError('Label not found', { extensions: { code: 'NOT_FOUND' } });
      }

      await requireWorkspaceAccess(context.prisma, label.workspaceId, context.userId);
      await context.prisma.label.delete({ where: { id: args.id } });
      return true;
    },
  } satisfies Pick<MutationResolvers, 'createLabel' | 'updateLabel' | 'deleteLabel'>,
  Label: {
    createdAt: (parent) => parent.createdAt.toISOString(),
    updatedAt: (parent) => parent.updatedAt.toISOString(),
  } satisfies LabelResolvers,
};
