import type { Task } from '@prisma/client';
import type {
  TaskResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';

export const taskResolvers = {
  Query: {
    tasks: (_parent, args, context) => {
      return context.prisma.task.findMany({
        where: { projectId: args.projectId },
        orderBy: { createdAt: 'desc' },
      });
    },
    task: (_parent, args, context) => {
      return context.prisma.task.findUnique({ where: { id: args.id } });
    },
  } satisfies Pick<QueryResolvers, 'tasks' | 'task'>,
  Mutation: {
    createTask: async (_parent, args, context) => {
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
      await context.prisma.task.delete({ where: { id: args.id } });
      return true;
    },
  } satisfies Pick<MutationResolvers, 'createTask' | 'updateTask' | 'deleteTask'>,
  Subscription: {
    taskChanged: {
      subscribe: (_parent: unknown, _args: unknown, context) => {
        return context.pubsub.subscribe('taskChanged');
      },
      resolve: (payload: Task) => payload,
    },
  } satisfies Pick<SubscriptionResolvers, 'taskChanged'>,
  Task: {
    project: (parent, _args, context) => {
      return context.prisma.project.findUniqueOrThrow({ where: { id: parent.projectId } });
    },
  } satisfies TaskResolvers,
};
