export const ProjectChangedDocument = /* GraphQL */ `
  subscription ProjectChanged {
    projectChanged {
      id
      name
      description
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
  subscription TaskChanged {
    taskChanged {
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
