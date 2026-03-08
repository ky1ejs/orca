import type { Task } from '@prisma/client';
import type {
  TaskResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import type { ServerContext } from '../context.js';
import {
  requireProjectAccess,
  requireTaskAccess,
  requireWorkspaceAccess,
} from '../auth/workspace.js';

export const taskResolvers = {
  Query: {
    task: async (_parent, args, context) => {
      const { task } = await requireTaskAccess(context.prisma, args.id, context.userId);
      return task;
    },
  } satisfies Pick<QueryResolvers, 'task'>,
  Mutation: {
    createTask: async (_parent, args, context) => {
      await requireProjectAccess(context.prisma, args.input.projectId, context.userId);
      const task = await context.prisma.$transaction(async (tx) => {
        // Re-fetch project inside transaction to guard against deletion between
        // access check and task creation
        const project = await tx.project.findUniqueOrThrow({
          where: { id: args.input.projectId },
        });
        // Atomic increment — PostgreSQL row lock serializes concurrent updates
        const workspace = await tx.workspace.update({
          where: { id: project.workspaceId },
          data: { taskCounter: { increment: 1 } },
        });
        const sequenceNumber = workspace.taskCounter;
        const displayId = `${workspace.slug.toUpperCase()}-${sequenceNumber}`;
        return tx.task.create({
          data: {
            title: args.input.title,
            description: args.input.description,
            status: args.input.status ?? 'TODO',
            priority: args.input.priority ?? 'NONE',
            projectId: args.input.projectId,
            workspaceId: project.workspaceId,
            sequenceNumber,
            displayId,
          },
        });
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
      if (args.input.priority != null) data.priority = args.input.priority;
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
      resolve: async (payload: Task, args: { workspaceId: string }, context: ServerContext) => {
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
  } satisfies Pick<SubscriptionResolvers, 'taskChanged'>,
  Task: {
    project: (parent, _args, context) => {
      return context.prisma.project.findUniqueOrThrow({ where: { id: parent.projectId } });
    },
  } satisfies TaskResolvers,
};
