export const ProjectsQueryDocument = /* GraphQL */ `
  query Projects {
    projects {
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

export const ProjectQueryDocument = /* GraphQL */ `
  query Project($id: ID!) {
    project(id: $id) {
      id
      name
      description
      tasks {
        id
        title
        status
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
`;

export const TasksQueryDocument = /* GraphQL */ `
  query Tasks($projectId: ID!) {
    tasks(projectId: $projectId) {
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

export const TaskQueryDocument = /* GraphQL */ `
  query Task($id: ID!) {
    task(id: $id) {
      id
      title
      description
      status
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
