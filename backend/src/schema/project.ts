import { GraphQLError } from 'graphql';
import type { Project } from '@prisma/client';
import type {
  ProjectResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import type { ServerContext } from '../context.js';
import type { PrismaClient } from '@prisma/client';
import {
  requireInitiativeAccess,
  requireProjectAccess,
  requireWorkspaceAccess,
} from '../auth/workspace.js';

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
      return project;
    },
    updateProject: async (_parent, args, context) => {
      const { project: existingProject } = await requireProjectAccess(
        context.prisma,
        args.id,
        context.userId,
      );
      const data: Record<string, unknown> = {};
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

      const project = await context.prisma.project.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('projectChanged', project);
      return project;
    },
    archiveProject: async (_parent, args, context) => {
      await requireProjectAccess(context.prisma, args.id, context.userId);
      const project = await context.prisma.project.update({
        where: { id: args.id },
        data: { archivedAt: new Date() },
      });
      context.pubsub.publish('projectChanged', project);
      return project;
    },
  } satisfies Pick<MutationResolvers, 'createProject' | 'updateProject' | 'archiveProject'>,
  Subscription: {
    projectChanged: {
      subscribe: async (_parent: unknown, args: { workspaceId: string }, context) => {
        await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
        return context.pubsub.subscribe('projectChanged');
      },
      resolve: async (payload: Project, args: { workspaceId: string }, context: ServerContext) => {
        if (payload.workspaceId !== args.workspaceId) return undefined as never;

        // Re-validate membership per event
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
  } satisfies Pick<SubscriptionResolvers, 'projectChanged'>,
  Project: {
    tasks: (parent, _args, context) => {
      return context.prisma.task.findMany({
        where: { projectId: parent.id, archivedAt: null },
      });
    },
    workspace: (parent, _args, context) => {
      return context.prisma.workspace.findUniqueOrThrow({ where: { id: parent.workspaceId } });
    },
    initiative: (parent, _args, context) => {
      if (!parent.initiativeId) return null;
      return context.prisma.initiative.findUnique({ where: { id: parent.initiativeId } });
    },
  } satisfies ProjectResolvers,
};
