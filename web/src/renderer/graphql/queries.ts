export const WorkspacesQueryDocument = /* GraphQL */ `
  query Workspaces {
    workspaces {
      id
      name
      slug
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
      projects {
        id
        name
        description
        tasks {
          id
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

export const ProjectQueryDocument = /* GraphQL */ `
  query Project($id: ID!) {
    project(id: $id) {
      id
      name
      description
      workspaceId
      tasks {
        id
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
