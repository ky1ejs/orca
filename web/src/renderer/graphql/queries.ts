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
      initiatives {
        id
        name
        description
        projects {
          id
          name
          description
          defaultDirectory
          initiativeId
          tasks {
            id
            displayId
            title
            status
            priority
            assignee {
              id
              name
            }
            labels {
              id
              name
              color
            }
            pullRequestCount
          }
          archivedAt
          createdAt
          updatedAt
        }
        archivedAt
        createdAt
        updatedAt
      }
      projects {
        id
        name
        description
        defaultDirectory
        initiativeId
        tasks {
          id
          displayId
          title
          status
          priority
          assignee {
            id
            name
          }
          labels {
            id
            name
            color
          }
          pullRequestCount
        }
        archivedAt
        createdAt
        updatedAt
      }
      tasks(unassociatedOnly: true) {
        id
        displayId
        title
        status
        priority
        assignee {
          id
          name
        }
        labels {
          id
          name
          color
        }
        pullRequestCount
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

export const InitiativeQueryDocument = /* GraphQL */ `
  query Initiative($id: ID!) {
    initiative(id: $id) {
      id
      name
      description
      workspaceId
      projects {
        id
        name
        description
        defaultDirectory
        initiativeId
        tasks {
          id
          displayId
          title
          status
          priority
          assignee {
            id
            name
          }
          labels {
            id
            name
            color
          }
          pullRequestCount
          createdAt
          updatedAt
        }
        archivedAt
        createdAt
        updatedAt
      }
      archivedAt
      createdAt
      updatedAt
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
      initiativeId
      initiative {
        id
        name
      }
      tasks {
        id
        displayId
        title
        status
        priority
        assignee {
          id
          name
        }
        labels {
          id
          name
          color
        }
        pullRequestCount
        createdAt
        updatedAt
      }
      archivedAt
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
      assignee {
        id
        name
        email
      }
      labels {
        id
        name
        color
      }
      pullRequests {
        id
        number
        title
        url
        status
        reviewStatus
        checkStatus
        repository
        headBranch
        author
        draft
        createdAt
      }
      archivedAt
      createdAt
      updatedAt
    }
  }
`;

export const WorkspaceIntegrationsQueryDocument = /* GraphQL */ `
  query WorkspaceIntegrations($slug: String!) {
    workspace(slug: $slug) {
      id
      role
      githubInstallation {
        id
        installationId
        accountLogin
        accountType
        repositories
        observedRepositories
        createdAt
      }
      settings {
        id
        autoCloseOnMerge
        autoInReviewOnPrOpen
      }
    }
  }
`;

export const GitHubAppInstallUrlQueryDocument = /* GraphQL */ `
  query GitHubAppInstallUrl($workspaceId: ID!) {
    githubAppInstallUrl(workspaceId: $workspaceId)
  }
`;

export const LabelsQueryDocument = /* GraphQL */ `
  query Labels($workspaceId: ID!) {
    labels(workspaceId: $workspaceId) {
      id
      name
      color
      workspaceId
      createdAt
      updatedAt
    }
  }
`;
