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
            pullRequests {
              id
              number
              status
              draft
              checkStatus
              createdAt
            }
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
          pullRequests {
            id
            number
            status
            draft
            checkStatus
            createdAt
          }
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
        pullRequests {
          id
          number
          status
          draft
          checkStatus
          createdAt
        }
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
      relationships {
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
      archivedAt
      createdAt
      updatedAt
    }
  }
`;

export const TaskByDisplayIdQueryDocument = /* GraphQL */ `
  query TaskByDisplayId($displayId: String!, $workspaceId: ID!) {
    taskByDisplayId(displayId: $displayId, workspaceId: $workspaceId) {
      id
      displayId
      title
      status
      projectId
      project {
        id
        name
      }
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

export const GitHubOAuthUrlQueryDocument = /* GraphQL */ `
  query GitHubOAuthUrl($workspaceId: ID!) {
    githubOAuthUrl(workspaceId: $workspaceId)
  }
`;

export const TaskActivityQueryDocument = /* GraphQL */ `
  query TaskActivity($taskId: ID!, $first: Int, $after: String) {
    task(id: $taskId) {
      id
      activity(first: $first, after: $after) {
        edges {
          node {
            id
            action
            actorType
            actor {
              ... on User {
                id
                name
              }
              ... on SystemActor {
                label
              }
            }
            changes {
              field
              oldValue
              newValue
            }
            createdAt
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const ProjectActivityQueryDocument = /* GraphQL */ `
  query ProjectActivity($projectId: ID!, $first: Int, $after: String) {
    project(id: $projectId) {
      id
      activity(first: $first, after: $after) {
        edges {
          node {
            id
            action
            actorType
            actor {
              ... on User {
                id
                name
              }
              ... on SystemActor {
                label
              }
            }
            changes {
              field
              oldValue
              newValue
            }
            createdAt
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const InitiativeActivityQueryDocument = /* GraphQL */ `
  query InitiativeActivity($initiativeId: ID!, $first: Int, $after: String) {
    initiative(id: $initiativeId) {
      id
      activity(first: $first, after: $after) {
        edges {
          node {
            id
            action
            actorType
            actor {
              ... on User {
                id
                name
              }
              ... on SystemActor {
                label
              }
            }
            changes {
              field
              oldValue
              newValue
            }
            createdAt
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
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
