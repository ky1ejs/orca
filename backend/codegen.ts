import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'src/schema/schema.graphql',
  generates: {
    'src/__generated__/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context.js#ServerContext',
        scalars: {
          DateTime: 'Date',
        },
        mappers: {
          Workspace: '@prisma/client#Workspace as WorkspaceModel',
          Initiative: '@prisma/client#Initiative as InitiativeModel',
          Project: '@prisma/client#Project as ProjectModel',
          Task: '@prisma/client#Task as TaskModel',
          Label: '@prisma/client#Label as LabelModel',
          PullRequest: '@prisma/client#PullRequest as PullRequestModel',
          WorkspaceMember: '@prisma/client#WorkspaceMembership as WorkspaceMembershipModel',
          WorkspaceInvitation: '@prisma/client#WorkspaceInvitation as WorkspaceInvitationModel',
        },
        enumValues: {
          WorkspaceRole: '@prisma/client#WorkspaceRole',
          TaskStatus: '@prisma/client#TaskStatus',
          PullRequestStatus: '@prisma/client#PullRequestStatus',
          ReviewStatus: '@prisma/client#ReviewStatus',
        },
        useIndexSignature: true,
      },
    },
  },
};

export default config;
