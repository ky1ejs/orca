import { createSchema } from 'graphql-yoga';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerContext } from '../context.js';
import type { Resolvers } from '../__generated__/graphql.js';
import { authResolvers } from './auth.js';
import { initiativeResolvers } from './initiative.js';
import { membershipResolvers } from './membership.js';
import { projectResolvers } from './project.js';
import { labelResolvers } from './label.js';
import { DateTimeScalar } from './scalars.js';
import { taskResolvers } from './task.js';
import { workspaceResolvers } from './workspace.js';
import { pullRequestFieldResolvers } from './pull-request.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const typeDefs = readFileSync(resolve(__dirname, 'schema.graphql'), 'utf-8');

// Merge resolvers
const resolvers: Resolvers = {
  DateTime: DateTimeScalar,
  Query: {
    ...authResolvers.Query,
    ...workspaceResolvers.Query,
    ...initiativeResolvers.Query,
    ...projectResolvers.Query,
    ...taskResolvers.Query,
    ...labelResolvers.Query,
    ...membershipResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...workspaceResolvers.Mutation,
    ...initiativeResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...taskResolvers.Mutation,
    ...labelResolvers.Mutation,
    ...membershipResolvers.Mutation,
  },
  Subscription: {
    ...initiativeResolvers.Subscription,
    ...projectResolvers.Subscription,
    ...taskResolvers.Subscription,
  },
  Workspace: workspaceResolvers.Workspace,
  Initiative: initiativeResolvers.Initiative,
  Project: projectResolvers.Project,
  Task: {
    ...taskResolvers.Task,
    ...pullRequestFieldResolvers,
  },
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
