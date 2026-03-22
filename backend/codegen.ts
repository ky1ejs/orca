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
          GitHubInstallation: '@prisma/client#GitHubInstallation as GitHubInstallationModel',
          WorkspaceSettings: '@prisma/client#WorkspaceSettings as WorkspaceSettingsModel',
          WorkspaceMember: '@prisma/client#WorkspaceMembership as WorkspaceMembershipModel',
          WorkspaceInvitation: '@prisma/client#WorkspaceInvitation as WorkspaceInvitationModel',
          AuditEvent: '@prisma/client#AuditEvent as AuditEventModel',
        },
        enumValues: {
          WorkspaceRole: '@prisma/client#WorkspaceRole',
          TaskStatus: '@prisma/client#TaskStatus',
          PullRequestStatus: '@prisma/client#PullRequestStatus',
          ReviewStatus: '@prisma/client#ReviewStatus',
          CheckStatus: '@prisma/client#CheckStatus',
          AuditEntityType: '@prisma/client#AuditEntityType',
          AuditAction: '@prisma/client#AuditAction',
          AuditActorType: '@prisma/client#AuditActorType',
        },
        useIndexSignature: true,
      },
    },
  },
};

export default config;
