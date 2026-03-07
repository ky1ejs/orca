import type { Project } from '@prisma/client';
import type {
  ProjectResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';

export const projectResolvers = {
  Query: {
    projects: (_parent, _args, context) => {
      return context.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
    },
    project: (_parent, args, context) => {
      return context.prisma.project.findUnique({ where: { id: args.id } });
    },
  } satisfies Pick<QueryResolvers, 'projects' | 'project'>,
  Mutation: {
    createProject: async (_parent, args, context) => {
      const project = await context.prisma.project.create({
        data: {
          name: args.input.name,
          description: args.input.description,
        },
      });
      context.pubsub.publish('projectChanged', project);
      return project;
    },
    updateProject: async (_parent, args, context) => {
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
    deleteProject: async (_parent, args, context) => {
      await context.prisma.project.delete({ where: { id: args.id } });
      return true;
    },
  } satisfies Pick<MutationResolvers, 'createProject' | 'updateProject' | 'deleteProject'>,
  Subscription: {
    projectChanged: {
      subscribe: (_parent: unknown, _args: unknown, context) => {
        return context.pubsub.subscribe('projectChanged');
      },
      resolve: (payload: Project) => payload,
    },
  } satisfies Pick<SubscriptionResolvers, 'projectChanged'>,
  Project: {
    tasks: (parent, _args, context) => {
      return context.prisma.task.findMany({ where: { projectId: parent.id } });
    },
  } satisfies ProjectResolvers,
};
