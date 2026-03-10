import type { Initiative, Prisma } from '@prisma/client';
import type {
  InitiativeResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import type { ServerContext } from '../context.js';
import { requireInitiativeAccess, requireWorkspaceAccess } from '../auth/workspace.js';

export const initiativeResolvers = {
  Query: {
    initiative: async (_parent, args, context) => {
      const { initiative } = await requireInitiativeAccess(context.prisma, args.id, context.userId);
      return initiative;
    },
  } satisfies Pick<QueryResolvers, 'initiative'>,
  Mutation: {
    createInitiative: async (_parent, args, context) => {
      await requireWorkspaceAccess(context.prisma, args.input.workspaceId, context.userId);
      const initiative = await context.prisma.initiative.create({
        data: {
          name: args.input.name,
          description: args.input.description,
          workspaceId: args.input.workspaceId,
        },
      });
      context.pubsub.publish('initiativeChanged', initiative);
      return initiative;
    },
    updateInitiative: async (_parent, args, context) => {
      await requireInitiativeAccess(context.prisma, args.id, context.userId);
      const data: Prisma.InitiativeUncheckedUpdateInput = {};
      if (args.input.name != null) data.name = args.input.name;
      if (args.input.description !== undefined) data.description = args.input.description;
      const initiative = await context.prisma.initiative.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('initiativeChanged', initiative);
      return initiative;
    },
    archiveInitiative: async (_parent, args, context) => {
      await requireInitiativeAccess(context.prisma, args.id, context.userId);
      const initiative = await context.prisma.initiative.update({
        where: { id: args.id },
        data: { archivedAt: new Date() },
      });
      context.pubsub.publish('initiativeChanged', initiative);
      return initiative;
    },
  } satisfies Pick<
    MutationResolvers,
    'createInitiative' | 'updateInitiative' | 'archiveInitiative'
  >,
  Subscription: {
    initiativeChanged: {
      subscribe: async (_parent: unknown, args: { workspaceId: string }, context) => {
        await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
        return context.pubsub.subscribe('initiativeChanged');
      },
      resolve: async (
        payload: Initiative,
        args: { workspaceId: string },
        context: ServerContext,
      ) => {
        if (payload.workspaceId !== args.workspaceId) return undefined as never;

        const membership = await context.prisma.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: args.workspaceId,
              userId: context.userId,
            },
          },
        });
        if (!membership) return undefined as never;

        return payload;
      },
    },
  } satisfies Pick<SubscriptionResolvers, 'initiativeChanged'>,
  Initiative: {
    projects: (parent, _args, context) => {
      return context.prisma.project.findMany({
        where: { initiativeId: parent.id, archivedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    },
    workspace: (parent, _args, context) => {
      return context.prisma.workspace.findUniqueOrThrow({ where: { id: parent.workspaceId } });
    },
  } satisfies InitiativeResolvers,
};
