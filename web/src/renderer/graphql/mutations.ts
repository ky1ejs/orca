export const CreateWorkspaceDocument = /* GraphQL */ `
  mutation CreateWorkspace($input: CreateWorkspaceInput!) {
    createWorkspace(input: $input) {
      id
      name
      slug
      createdAt
      updatedAt
    }
  }
`;

export const UpdateWorkspaceDocument = /* GraphQL */ `
  mutation UpdateWorkspace($id: ID!, $input: UpdateWorkspaceInput!) {
    updateWorkspace(id: $id, input: $input) {
      id
      name
      slug
      createdAt
      updatedAt
    }
  }
`;

export const DeleteWorkspaceDocument = /* GraphQL */ `
  mutation DeleteWorkspace($id: ID!) {
    deleteWorkspace(id: $id)
  }
`;

export const CreateInitiativeDocument = /* GraphQL */ `
  mutation CreateInitiative($input: CreateInitiativeInput!) {
    createInitiative(input: $input) {
      id
      name
      description
      workspaceId
      archivedAt
      createdAt
      updatedAt
    }
  }
`;

export const UpdateInitiativeDocument = /* GraphQL */ `
  mutation UpdateInitiative($id: ID!, $input: UpdateInitiativeInput!) {
    updateInitiative(id: $id, input: $input) {
      id
      name
      description
      archivedAt
      createdAt
      updatedAt
    }
  }
`;

export const ArchiveInitiativeDocument = /* GraphQL */ `
  mutation ArchiveInitiative($id: ID!) {
    archiveInitiative(id: $id) {
      id
      archivedAt
    }
  }
`;

export const CreateProjectDocument = /* GraphQL */ `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      name
      description
      defaultDirectory
      workspaceId
      initiativeId
      tasks {
        id
        displayId
        title
        status
      }
      archivedAt
      createdAt
      updatedAt
    }
  }
`;

export const UpdateProjectDocument = /* GraphQL */ `
  mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
    updateProject(id: $id, input: $input) {
      id
      name
      description
      defaultDirectory
      initiativeId
      archivedAt
      createdAt
      updatedAt
    }
  }
`;

export const ArchiveProjectDocument = /* GraphQL */ `
  mutation ArchiveProject($id: ID!) {
    archiveProject(id: $id) {
      id
      archivedAt
    }
  }
`;

export const CreateTaskDocument = /* GraphQL */ `
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      id
      displayId
      title
      description
      status
      priority
      projectId
      project {
        id
        name
      }
      assignee {
        id
        name
      }
      labels {
        id
        name
        color
      }
      createdAt
      updatedAt
    }
  }
`;

export const UpdateTaskDocument = /* GraphQL */ `
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      id
      displayId
      title
      description
      status
      priority
      projectId
      project {
        id
        name
      }
      assignee {
        id
        name
      }
      labels {
        id
        name
        color
      }
      createdAt
      updatedAt
    }
  }
`;

export const ArchiveTaskDocument = /* GraphQL */ `
  mutation ArchiveTask($id: ID!) {
    archiveTask(id: $id) {
      id
      archivedAt
    }
  }
`;

export const AddMemberDocument = /* GraphQL */ `
  mutation AddMember($input: AddMemberInput!) {
    addMember(input: $input) {
      ... on MemberAdded {
        member {
          id
          user {
            id
            name
            email
          }
          role
        }
        message
      }
      ... on InvitationCreated {
        invitation {
          id
          email
          role
          expiresAt
        }
        message
      }
    }
  }
`;

export const RemoveMemberDocument = /* GraphQL */ `
  mutation RemoveMember($workspaceId: ID!, $userId: ID!) {
    removeMember(workspaceId: $workspaceId, userId: $userId)
  }
`;

export const UpdateMemberRoleDocument = /* GraphQL */ `
  mutation UpdateMemberRole($input: UpdateMemberRoleInput!) {
    updateMemberRole(input: $input) {
      id
      user {
        id
        name
        email
      }
      role
    }
  }
`;

export const CancelInvitationDocument = /* GraphQL */ `
  mutation CancelInvitation($id: ID!) {
    cancelInvitation(id: $id)
  }
`;

export const AcceptInvitationDocument = /* GraphQL */ `
  mutation AcceptInvitation($id: ID!) {
    acceptInvitation(id: $id) {
      id
      name
      slug
    }
  }
`;

export const DeclineInvitationDocument = /* GraphQL */ `
  mutation DeclineInvitation($id: ID!) {
    declineInvitation(id: $id)
  }
`;

export const CompleteGitHubInstallationDocument = /* GraphQL */ `
  mutation CompleteGitHubInstallation($workspaceId: ID!, $installationId: Int!) {
    completeGitHubInstallation(workspaceId: $workspaceId, installationId: $installationId) {
      id
      installationId
      accountLogin
      accountType
      repositories
      observedRepositories
      createdAt
    }
  }
`;

export const RemoveGitHubInstallationDocument = /* GraphQL */ `
  mutation RemoveGitHubInstallation($workspaceId: ID!) {
    removeGitHubInstallation(workspaceId: $workspaceId)
  }
`;

export const UpdateObservedRepositoriesDocument = /* GraphQL */ `
  mutation UpdateObservedRepositories($workspaceId: ID!, $repositories: [String!]!) {
    updateObservedRepositories(workspaceId: $workspaceId, repositories: $repositories) {
      id
      observedRepositories
    }
  }
`;

export const UpdateWorkspaceSettingsDocument = /* GraphQL */ `
  mutation UpdateWorkspaceSettings($workspaceId: ID!, $input: UpdateWorkspaceSettingsInput!) {
    updateWorkspaceSettings(workspaceId: $workspaceId, input: $input) {
      id
      autoCloseOnMerge
      autoInReviewOnPrOpen
    }
  }
`;

export const CreateLabelDocument = /* GraphQL */ `
  mutation CreateLabel($input: CreateLabelInput!) {
    createLabel(input: $input) {
      id
      name
      color
      workspaceId
      createdAt
      updatedAt
    }
  }
`;

export const UpdateLabelDocument = /* GraphQL */ `
  mutation UpdateLabel($id: ID!, $input: UpdateLabelInput!) {
    updateLabel(id: $id, input: $input) {
      id
      name
      color
      workspaceId
      createdAt
      updatedAt
    }
  }
`;

export const DeleteLabelDocument = /* GraphQL */ `
  mutation DeleteLabel($id: ID!) {
    deleteLabel(id: $id)
  }
`;

export const LinkPullRequestDocument = /* GraphQL */ `
  mutation LinkPullRequest($input: LinkPullRequestInput!) {
    linkPullRequest(input: $input) {
      id
      number
      title
      url
      status
      reviewStatus
      repository
      headBranch
      author
      draft
      createdAt
    }
  }
`;

export const UnlinkPullRequestDocument = /* GraphQL */ `
  mutation UnlinkPullRequest($id: ID!) {
    unlinkPullRequest(id: $id)
  }
`;

export const CreateTaskRelationshipDocument = /* GraphQL */ `
  mutation CreateTaskRelationship($input: CreateTaskRelationshipInput!) {
    createTaskRelationship(input: $input) {
      id
      type
      displayType
      relatedTask {
        id
        displayId
        title
        status
      }
      createdAt
    }
  }
`;

export const RemoveTaskRelationshipDocument = /* GraphQL */ `
  mutation RemoveTaskRelationship($id: ID!) {
    removeTaskRelationship(id: $id)
  }
`;
