export const ProjectChangedDocument = /* GraphQL */ `
  subscription ProjectChanged {
    projectChanged {
      id
      name
      description
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
