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

export const CreateProjectDocument = /* GraphQL */ `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      name
      description
      workspaceId
      tasks {
        id
        title
        status
      }
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
      createdAt
      updatedAt
    }
  }
`;

export const DeleteProjectDocument = /* GraphQL */ `
  mutation DeleteProject($id: ID!) {
    deleteProject(id: $id)
  }
`;

export const CreateTaskDocument = /* GraphQL */ `
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      id
      title
      description
      status
      priority
      projectId
      project {
        id
        name
      }
      workingDirectory
      createdAt
      updatedAt
    }
  }
`;

export const UpdateTaskDocument = /* GraphQL */ `
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      id
      title
      description
      status
      priority
      projectId
      workingDirectory
      createdAt
      updatedAt
    }
  }
`;

export const DeleteTaskDocument = /* GraphQL */ `
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
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
