import { createSchema } from 'graphql-yoga';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerContext } from '../context.js';
import type { Resolvers } from '../__generated__/graphql.js';
import { authResolvers } from './auth.js';
import { membershipResolvers } from './membership.js';
import { projectResolvers } from './project.js';
import { taskResolvers } from './task.js';
import { workspaceResolvers } from './workspace.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const typeDefs = readFileSync(resolve(__dirname, 'schema.graphql'), 'utf-8');

// Merge resolvers
const resolvers: Resolvers = {
  Query: {
    ...authResolvers.Query,
    ...workspaceResolvers.Query,
    ...projectResolvers.Query,
    ...taskResolvers.Query,
    ...membershipResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...workspaceResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...taskResolvers.Mutation,
    ...membershipResolvers.Mutation,
  },
  Subscription: {
    ...projectResolvers.Subscription,
    ...taskResolvers.Subscription,
  },
  Workspace: workspaceResolvers.Workspace,
  Project: projectResolvers.Project,
  Task: taskResolvers.Task,
  AddMemberResult: {
    __resolveType: (obj) => {
      if ('member' in obj) return 'MemberAdded';
      if ('invitation' in obj) return 'InvitationCreated';
      return null;
    },
  },
};

export const schema = createSchema<ServerContext>({
  typeDefs,
  resolvers,
});
