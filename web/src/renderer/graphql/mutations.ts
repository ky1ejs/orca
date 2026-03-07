export const CreateProjectDocument = /* GraphQL */ `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      name
      description
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
      projectId
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
