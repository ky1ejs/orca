import type { ServerContext } from '../context.js';

export const projectResolvers = {
  Query: {
    projects: (_parent: unknown, _args: unknown, context: ServerContext) => {
      return context.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
    },
    project: (_parent: unknown, args: { id: string }, context: ServerContext) => {
      return context.prisma.project.findUnique({ where: { id: args.id } });
    },
  },
  Mutation: {
    createProject: async (
      _parent: unknown,
      args: { input: { name: string; description?: string | null } },
      context: ServerContext,
    ) => {
      const project = await context.prisma.project.create({
        data: {
          name: args.input.name,
          description: args.input.description,
        },
      });
      context.pubsub.publish('projectChanged', project);
      return project;
    },
    updateProject: async (
      _parent: unknown,
      args: { id: string; input: { name?: string | null; description?: string | null } },
      context: ServerContext,
    ) => {
      const data: Record<string, unknown> = {};
      if (args.input.name != null) data.name = args.input.name;
      if (args.input.description !== undefined) data.description = args.input.description;
      const project = await context.prisma.project.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('projectChanged', project);
      return project;
    },
    deleteProject: async (_parent: unknown, args: { id: string }, context: ServerContext) => {
      await context.prisma.project.delete({ where: { id: args.id } });
      return true;
    },
  },
  Subscription: {
    projectChanged: {
      subscribe: (_parent: unknown, _args: unknown, context: ServerContext) => {
        return context.pubsub.subscribe('projectChanged');
      },
      resolve: (payload: unknown) => payload,
    },
  },
  Project: {
    tasks: (parent: { id: string }, _args: unknown, context: ServerContext) => {
      return context.prisma.task.findMany({ where: { projectId: parent.id } });
    },
  },
};
