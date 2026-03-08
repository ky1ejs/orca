export const MeQueryDocument = /* GraphQL */ `
  query Me {
    me {
      id
      email
      name
    }
  }
`;

export const WorkspacesQueryDocument = /* GraphQL */ `
  query Workspaces {
    workspaces {
      id
      name
      slug
      role
      createdAt
      updatedAt
    }
  }
`;

export const WorkspaceQueryDocument = /* GraphQL */ `
  query Workspace($slug: String!) {
    workspace(slug: $slug) {
      id
      name
      slug
      role
      projects {
        id
        name
        description
        defaultDirectory
        tasks {
          id
          displayId
          title
          status
          priority
        }
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
`;

export const WorkspaceMembersQueryDocument = /* GraphQL */ `
  query WorkspaceMembers($slug: String!) {
    workspace(slug: $slug) {
      id
      name
      role
      members {
        id
        user {
          id
          name
          email
        }
        role
        createdAt
      }
      invitations {
        id
        email
        role
        invitedBy {
          id
          name
        }
        expiresAt
        createdAt
      }
    }
  }
`;

export const PendingInvitationsQueryDocument = /* GraphQL */ `
  query PendingInvitations {
    pendingInvitations {
      id
      email
      role
      workspace {
        id
        name
        slug
      }
      invitedBy {
        id
        name
      }
      expiresAt
      createdAt
    }
  }
`;

export const ProjectQueryDocument = /* GraphQL */ `
  query Project($id: ID!) {
    project(id: $id) {
      id
      name
      description
      defaultDirectory
      workspaceId
      tasks {
        id
        displayId
        title
        status
        priority
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
`;

export const TaskQueryDocument = /* GraphQL */ `
  query Task($id: ID!) {
    task(id: $id) {
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
        defaultDirectory
      }
      createdAt
      updatedAt
    }
  }
`;
