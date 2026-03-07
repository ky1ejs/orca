import type { ServerContext } from '../context.js';

export const taskResolvers = {
  Query: {
    tasks: (_parent: unknown, args: { projectId: string }, context: ServerContext) => {
      return context.prisma.task.findMany({
        where: { projectId: args.projectId },
        orderBy: { createdAt: 'desc' },
      });
    },
    task: (_parent: unknown, args: { id: string }, context: ServerContext) => {
      return context.prisma.task.findUnique({ where: { id: args.id } });
    },
  },
  Mutation: {
    createTask: async (
      _parent: unknown,
      args: {
        input: {
          title: string;
          description?: string | null;
          status?: string | null;
          projectId: string;
        };
      },
      context: ServerContext,
    ) => {
      const task = await context.prisma.task.create({
        data: {
          title: args.input.title,
          description: args.input.description,
          status: (args.input.status as 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE') ?? 'TODO',
          projectId: args.input.projectId,
        },
      });
      context.pubsub.publish('taskChanged', task);
      return task;
    },
    updateTask: async (
      _parent: unknown,
      args: {
        id: string;
        input: { title?: string | null; description?: string | null; status?: string | null };
      },
      context: ServerContext,
    ) => {
      const data: Record<string, unknown> = {};
      if (args.input.title != null) data.title = args.input.title;
      if (args.input.description !== undefined) data.description = args.input.description;
      if (args.input.status != null) data.status = args.input.status;
      const task = await context.prisma.task.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('taskChanged', task);
      return task;
    },
    deleteTask: async (_parent: unknown, args: { id: string }, context: ServerContext) => {
      await context.prisma.task.delete({ where: { id: args.id } });
      return true;
    },
  },
  Subscription: {
    taskChanged: {
      subscribe: (_parent: unknown, _args: unknown, context: ServerContext) => {
        return context.pubsub.subscribe('taskChanged');
      },
      resolve: (payload: unknown) => payload,
    },
  },
  Task: {
    project: (parent: { projectId: string }, _args: unknown, context: ServerContext) => {
      return context.prisma.project.findUnique({ where: { id: parent.projectId } });
    },
  },
};
