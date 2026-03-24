import type { Initiative, Prisma } from '@prisma/client';
import type {
  InitiativeResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import {
  requireInitiativeAccess,
  requireWorkspaceAccess,
  workspaceScopedSubscription,
} from '../auth/workspace.js';
import { recordAuditEvent } from '../audit/record-event.js';
import { diffFields } from '../audit/diff.js';

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
      recordAuditEvent(context.prisma, {
        entityType: 'INITIATIVE',
        entityId: initiative.id,
        action: 'CREATED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: initiative.workspaceId,
      });
      return initiative;
    },
    updateInitiative: async (_parent, args, context) => {
      const { initiative: existingInitiative } = await requireInitiativeAccess(
        context.prisma,
        args.id,
        context.userId,
      );
      const data: Prisma.InitiativeUncheckedUpdateInput = {};
      if (args.input.name != null) data.name = args.input.name;
      if (args.input.description !== undefined) data.description = args.input.description;

      const auditChanges = diffFields(
        existingInitiative,
        {
          ...(args.input.name != null && { name: args.input.name }),
          ...(args.input.description !== undefined && { description: args.input.description }),
        },
        ['name', 'description'],
      );

      const initiative = await context.prisma.initiative.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('initiativeChanged', initiative);

      if (auditChanges.length > 0) {
        recordAuditEvent(context.prisma, {
          entityType: 'INITIATIVE',
          entityId: initiative.id,
          action: 'UPDATED',
          actorType: 'USER',
          actorId: context.userId,
          workspaceId: initiative.workspaceId,
          changes: auditChanges,
        });
      }

      return initiative;
    },
    archiveInitiative: async (_parent, args, context) => {
      await requireInitiativeAccess(context.prisma, args.id, context.userId);
      const initiative = await context.prisma.initiative.update({
        where: { id: args.id },
        data: { archivedAt: new Date() },
      });
      context.pubsub.publish('initiativeChanged', initiative);
      recordAuditEvent(context.prisma, {
        entityType: 'INITIATIVE',
        entityId: initiative.id,
        action: 'ARCHIVED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: initiative.workspaceId,
      });
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
        return workspaceScopedSubscription(
          context.pubsub.subscribe('initiativeChanged'),
          context.prisma,
          args.workspaceId,
          context.userId,
        );
      },
      resolve: (payload: Initiative) => payload,
    },
  } satisfies Pick<SubscriptionResolvers, 'initiativeChanged'>,
  Initiative: {
    projects: (parent, _args, context) => {
      return context.loaders.projectsByInitiativeId.load(parent.id);
    },
    workspace: async (parent, _args, context) => {
      const ws = await context.loaders.workspaceById.load(parent.workspaceId);
      if (!ws) throw new Error(`Workspace ${parent.workspaceId} not found`);
      return ws;
    },
  } satisfies InitiativeResolvers,
};
