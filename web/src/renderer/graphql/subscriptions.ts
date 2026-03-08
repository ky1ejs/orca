export const ProjectChangedDocument = /* GraphQL */ `
  subscription ProjectChanged($workspaceId: ID!) {
    projectChanged(workspaceId: $workspaceId) {
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

export const TaskChangedDocument = /* GraphQL */ `
  subscription TaskChanged($workspaceId: ID!) {
    taskChanged(workspaceId: $workspaceId) {
      id
      title
      description
      status
      projectId
      workingDirectory
      createdAt
      updatedAt
    }
  }
`;
