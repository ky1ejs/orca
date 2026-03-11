export const InitiativeChangedDocument = /* GraphQL */ `
  subscription InitiativeChanged($workspaceId: ID!) {
    initiativeChanged(workspaceId: $workspaceId) {
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

export const ProjectChangedDocument = /* GraphQL */ `
  subscription ProjectChanged($workspaceId: ID!) {
    projectChanged(workspaceId: $workspaceId) {
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

export const TaskChangedDocument = /* GraphQL */ `
  subscription TaskChanged($workspaceId: ID!) {
    taskChanged(workspaceId: $workspaceId) {
      id
      displayId
      title
      description
      status
      projectId
      assignee {
        id
        name
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
        draft
      }
      pullRequestCount
      archivedAt
      createdAt
      updatedAt
    }
  }
`;
