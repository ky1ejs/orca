import type { Task } from '@prisma/client';
import type {
  TaskResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import {
  requireProjectAccess,
  requireTaskAccess,
  requireWorkspaceAccess,
} from '../auth/workspace.js';

export const taskResolvers = {
  Query: {
    task: async (_parent, args, context) => {
      const task = await requireTaskAccess(context.prisma, args.id, context.userId);
      return task;
    },
  } satisfies Pick<QueryResolvers, 'task'>,
  Mutation: {
    createTask: async (_parent, args, context) => {
      await requireProjectAccess(context.prisma, args.input.projectId, context.userId);
      const task = await context.prisma.task.create({
        data: {
          title: args.input.title,
          description: args.input.description,
          status: args.input.status ?? 'TODO',
          projectId: args.input.projectId,
          workingDirectory: args.input.workingDirectory,
        },
      });
      context.pubsub.publish('taskChanged', task);
      return task;
    },
    updateTask: async (_parent, args, context) => {
      await requireTaskAccess(context.prisma, args.id, context.userId);
      const data: Record<string, unknown> = {};
      if (args.input.title != null) data.title = args.input.title;
      if (args.input.description !== undefined) data.description = args.input.description;
      if (args.input.status != null) data.status = args.input.status;
      if (args.input.workingDirectory != null) data.workingDirectory = args.input.workingDirectory;
      const task = await context.prisma.task.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('taskChanged', task);
      return task;
    },
    deleteTask: async (_parent, args, context) => {
      await requireTaskAccess(context.prisma, args.id, context.userId);
      await context.prisma.task.delete({ where: { id: args.id } });
      return true;
    },
  } satisfies Pick<MutationResolvers, 'createTask' | 'updateTask' | 'deleteTask'>,
  Subscription: {
    taskChanged: {
      subscribe: async (_parent: unknown, args: { workspaceId: string }, context) => {
        await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
        return context.pubsub.subscribe('taskChanged');
      },
      resolve: (
        payload: Task & { project?: { workspaceId: string } },
        args: { workspaceId: string },
      ) => {
        // Filter: only forward events for this workspace
        if (payload.project?.workspaceId !== args.workspaceId) return undefined as never;
        return payload;
      },
    },
  } satisfies Pick<SubscriptionResolvers, 'taskChanged'>,
  Task: {
    project: (parent, _args, context) => {
      return context.prisma.project.findUniqueOrThrow({ where: { id: parent.projectId } });
    },
  } satisfies TaskResolvers,
};
