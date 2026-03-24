import { GraphQLError } from 'graphql';
import type { Project, Prisma } from '@prisma/client';
import type {
  ProjectResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import type { PrismaClient } from '@prisma/client';
import {
  requireInitiativeAccess,
  requireProjectAccess,
  requireWorkspaceAccess,
  workspaceScopedSubscription,
} from '../auth/workspace.js';
import { recordAuditEvent } from '../audit/record-event.js';
import { diffFields } from '../audit/diff.js';

async function validateInitiativeBelongsToWorkspace(
  prisma: PrismaClient,
  initiativeId: string,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { initiative } = await requireInitiativeAccess(prisma, initiativeId, userId);
  if (initiative.workspaceId !== workspaceId) {
    throw new GraphQLError('Initiative does not belong to this workspace', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}

export const projectResolvers = {
  Query: {
    project: async (_parent, args, context) => {
      const { project } = await requireProjectAccess(context.prisma, args.id, context.userId);
      return project;
    },
  } satisfies Pick<QueryResolvers, 'project'>,
  Mutation: {
    createProject: async (_parent, args, context) => {
      await requireWorkspaceAccess(context.prisma, args.input.workspaceId, context.userId);

      if (args.input.initiativeId) {
        await validateInitiativeBelongsToWorkspace(
          context.prisma,
          args.input.initiativeId,
          args.input.workspaceId,
          context.userId,
        );
      }

      const project = await context.prisma.project.create({
        data: {
          name: args.input.name,
          description: args.input.description,
          defaultDirectory: args.input.defaultDirectory ?? null,
          workspaceId: args.input.workspaceId,
          initiativeId: args.input.initiativeId ?? null,
        },
      });
      context.pubsub.publish('projectChanged', project);
      recordAuditEvent(context.prisma, {
        entityType: 'PROJECT',
        entityId: project.id,
        action: 'CREATED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: project.workspaceId,
      });
      return project;
    },
    updateProject: async (_parent, args, context) => {
      const { project: existingProject } = await requireProjectAccess(
        context.prisma,
        args.id,
        context.userId,
      );
      const data: Prisma.ProjectUncheckedUpdateInput = {};
      if (args.input.name != null) data.name = args.input.name;
      if (args.input.description !== undefined) data.description = args.input.description;
      if (args.input.defaultDirectory !== undefined)
        data.defaultDirectory = args.input.defaultDirectory;

      if (args.input.initiativeId !== undefined) {
        if (args.input.initiativeId) {
          await validateInitiativeBelongsToWorkspace(
            context.prisma,
            args.input.initiativeId,
            existingProject.workspaceId,
            context.userId,
          );
          data.initiativeId = args.input.initiativeId;
        } else {
          data.initiativeId = null;
        }
      }

      const auditChanges = diffFields(
        existingProject,
        {
          ...(args.input.name != null && { name: args.input.name }),
          ...(args.input.description !== undefined && { description: args.input.description }),
          ...(args.input.defaultDirectory !== undefined && {
            defaultDirectory: args.input.defaultDirectory,
          }),
        },
        ['name', 'description', 'defaultDirectory'],
      );

      if (
        args.input.initiativeId !== undefined &&
        args.input.initiativeId !== existingProject.initiativeId
      ) {
        const [oldInit, newInit] = await Promise.all([
          existingProject.initiativeId
            ? context.prisma.initiative.findUnique({
                where: { id: existingProject.initiativeId },
              })
            : null,
          args.input.initiativeId
            ? context.prisma.initiative.findUnique({
                where: { id: args.input.initiativeId },
              })
            : null,
        ]);
        auditChanges.push(
          {
            field: 'initiativeId',
            oldValue: existingProject.initiativeId ?? null,
            newValue: args.input.initiativeId ?? null,
          },
          { field: 'initiative', oldValue: oldInit?.name ?? null, newValue: newInit?.name ?? null },
        );
      }

      const project = await context.prisma.project.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('projectChanged', project);

      if (auditChanges.length > 0) {
        recordAuditEvent(context.prisma, {
          entityType: 'PROJECT',
          entityId: project.id,
          action: 'UPDATED',
          actorType: 'USER',
          actorId: context.userId,
          workspaceId: project.workspaceId,
          changes: auditChanges,
        });
      }

      return project;
    },
    archiveProject: async (_parent, args, context) => {
      await requireProjectAccess(context.prisma, args.id, context.userId);
      const project = await context.prisma.project.update({
        where: { id: args.id },
        data: { archivedAt: new Date() },
      });
      context.pubsub.publish('projectChanged', project);
      recordAuditEvent(context.prisma, {
        entityType: 'PROJECT',
        entityId: project.id,
        action: 'ARCHIVED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: project.workspaceId,
      });
      return project;
    },
  } satisfies Pick<MutationResolvers, 'createProject' | 'updateProject' | 'archiveProject'>,
  Subscription: {
    projectChanged: {
      subscribe: async (_parent: unknown, args: { workspaceId: string }, context) => {
        await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
        return workspaceScopedSubscription(
          context.pubsub.subscribe('projectChanged'),
          context.prisma,
          args.workspaceId,
          context.userId,
        );
      },
      resolve: (payload: Project) => payload,
    },
  } satisfies Pick<SubscriptionResolvers, 'projectChanged'>,
  Project: {
    tasks: (parent, _args, context) => {
      return context.loaders.tasksByProjectId.load(parent.id);
    },
    workspace: async (parent, _args, context) => {
      const ws = await context.loaders.workspaceById.load(parent.workspaceId);
      if (!ws) {
        throw new GraphQLError(`Workspace ${parent.workspaceId} not found`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return ws;
    },
    initiative: (parent, _args, context) => {
      if (!parent.initiativeId) return null;
      return context.loaders.initiativeById.load(parent.initiativeId);
    },
  } satisfies ProjectResolvers,
};
