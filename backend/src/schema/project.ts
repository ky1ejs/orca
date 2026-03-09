import type { Project } from '@prisma/client';
import type {
  ProjectResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import type { ServerContext } from '../context.js';
import { requireProjectAccess, requireWorkspaceAccess } from '../auth/workspace.js';

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
      const project = await context.prisma.project.create({
        data: {
          name: args.input.name,
          description: args.input.description,
          defaultDirectory: args.input.defaultDirectory ?? null,
          workspaceId: args.input.workspaceId,
        },
      });
      context.pubsub.publish('projectChanged', project);
      return project;
    },
    updateProject: async (_parent, args, context) => {
      await requireProjectAccess(context.prisma, args.id, context.userId);
      const data: Record<string, unknown> = {};
      if (args.input.name != null) data.name = args.input.name;
      if (args.input.description !== undefined) data.description = args.input.description;
      if (args.input.defaultDirectory !== undefined)
        data.defaultDirectory = args.input.defaultDirectory;
      const project = await context.prisma.project.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('projectChanged', project);
      return project;
    },
    deleteProject: async (_parent, args, context) => {
      await requireProjectAccess(context.prisma, args.id, context.userId);
      await context.prisma.project.delete({ where: { id: args.id } });
      return true;
    },
  } satisfies Pick<MutationResolvers, 'createProject' | 'updateProject' | 'deleteProject'>,
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
    createdAt: (parent) => parent.createdAt.toISOString(),
    updatedAt: (parent) => parent.updatedAt.toISOString(),
    tasks: (parent, _args, context) => {
      return context.prisma.task.findMany({ where: { projectId: parent.id } });
    },
    workspace: (parent, _args, context) => {
      return context.prisma.workspace.findUniqueOrThrow({ where: { id: parent.workspaceId } });
    },
  } satisfies ProjectResolvers,
};
