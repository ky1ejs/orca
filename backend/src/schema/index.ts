import { createSchema } from 'graphql-yoga';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerContext } from '../context.js';
import type { Resolvers } from '../__generated__/graphql.js';
import { authResolvers } from './auth.js';
import { projectResolvers } from './project.js';
import { taskResolvers } from './task.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const typeDefs = readFileSync(resolve(__dirname, 'schema.graphql'), 'utf-8');

// Merge resolvers
const resolvers: Resolvers = {
  Query: {
    ...authResolvers.Query,
    ...projectResolvers.Query,
    ...taskResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...taskResolvers.Mutation,
  },
  Subscription: {
    ...projectResolvers.Subscription,
    ...taskResolvers.Subscription,
  },
  Project: projectResolvers.Project,
  Task: taskResolvers.Task,
};

export const schema = createSchema<ServerContext>({
  typeDefs,
  resolvers,
});
