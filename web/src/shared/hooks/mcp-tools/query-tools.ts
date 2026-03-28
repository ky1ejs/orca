import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  type McpToolsDeps,
  graphqlRequest,
  resolveToken,
  toolError,
  toolSuccess,
} from './helpers.js';

const TASK_LIST_FIELDS = `
  id displayId title description status priority projectId
  assignee { id name }
  labels { id name color }
  createdAt
`;

const TASK_DETAIL_FIELDS = `
  id displayId title description status priority projectId
  project { id name defaultDirectory }
  assignee { id name }
  labels { id name color }
  pullRequests { id number title url status reviewStatus repository headBranch draft }
  relationships { id displayType relatedTask { id displayId title status } }
  createdAt updatedAt
`;

const TASK_STATUS_ENUM = z
  .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])
  .optional()
  .describe('Filter tasks by status');

type TaskListItem = { title: string; projectId: string | null; status: string };

async function fetchWorkspaceTasks(
  backendUrl: string,
  token: string,
  workspaceSlug: string,
  errorPrefix: string,
): Promise<TaskListItem[] | ReturnType<typeof toolError>> {
  const gql = `
    query Workspace($slug: String!) {
      workspace(slug: $slug) { tasks { ${TASK_LIST_FIELDS} } }
    }
  `;
  const json = await graphqlRequest(backendUrl, token, gql, { slug: workspaceSlug });
  const workspace = json.data?.workspace as { tasks: TaskListItem[] } | null;

  if (json.errors || !workspace) {
    return toolError(
      `Failed to ${errorPrefix}: ${JSON.stringify(json.errors ?? 'workspace not found')}`,
    );
  }
  return workspace.tasks;
}

export function registerQueryTools(server: McpServer, deps: McpToolsDeps): void {
  // ── get_task ──────────────────────────────────────────────────────────
  server.registerTool(
    'get_task',
    {
      description:
        'Get a single task by ID or display ID (e.g. ORCA-123). When using displayId, workspaceId is required.',
      inputSchema: {
        id: z.string().optional().describe('Task UUID'),
        displayId: z.string().optional().describe('Task display ID (e.g. ORCA-123)'),
        workspaceId: z.string().optional().describe('Workspace ID (required when using displayId)'),
      },
    },
    async ({ id, displayId, workspaceId }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      if (!id && !displayId) {
        return toolError('Provide either id or displayId.');
      }

      if (id && displayId) {
        return toolError('Provide either id or displayId, not both.');
      }

      if (displayId && !workspaceId) {
        return toolError('workspaceId is required when using displayId.');
      }

      const query = id
        ? `query Task($id: ID!) { task(id: $id) { ${TASK_DETAIL_FIELDS} } }`
        : `query TaskByDisplayId($displayId: String!, $workspaceId: ID!) {
            taskByDisplayId(displayId: $displayId, workspaceId: $workspaceId) { ${TASK_DETAIL_FIELDS} }
          }`;

      const variables = id ? { id } : { displayId, workspaceId };

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, variables);
        const task = id ? json.data?.task : json.data?.taskByDisplayId;

        if (json.errors || !task) {
          return toolError(
            `Failed to get task: ${JSON.stringify(json.errors ?? 'task not found')}`,
          );
        }

        return toolSuccess(JSON.stringify(task, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── get_project ───────────────────────────────────────────────────────
  server.registerTool(
    'get_project',
    {
      description: 'Get a single project by ID, including its tasks.',
      inputSchema: {
        id: z.string().describe('The project ID'),
      },
    },
    async ({ id }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const query = `
        query Project($id: ID!) {
          project(id: $id) {
            id name description defaultDirectory workspaceId initiativeId
            initiative { id name }
            tasks { ${TASK_LIST_FIELDS} }
            createdAt updatedAt
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, { id });

        if (json.errors || !json.data?.project) {
          return toolError(
            `Failed to get project: ${JSON.stringify(json.errors ?? 'project not found')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.project, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── get_initiative ────────────────────────────────────────────────────
  server.registerTool(
    'get_initiative',
    {
      description: 'Get a single initiative by ID, including its projects.',
      inputSchema: {
        id: z.string().describe('The initiative ID'),
      },
    },
    async ({ id }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const query = `
        query Initiative($id: ID!) {
          initiative(id: $id) {
            id name description workspaceId
            projects { id name description defaultDirectory createdAt }
            createdAt updatedAt
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, { id });

        if (json.errors || !json.data?.initiative) {
          return toolError(
            `Failed to get initiative: ${JSON.stringify(json.errors ?? 'initiative not found')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.initiative, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── list_tasks ────────────────────────────────────────────────────────
  server.registerTool(
    'list_tasks',
    {
      description:
        'List tasks in a project (by projectId) or in a workspace (by workspaceSlug). Optionally filter by status. Returns up to `limit` results (default 100). When projectId is provided, workspaceSlug is ignored.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID to list tasks from'),
        workspaceSlug: z.string().optional().describe('Workspace slug to list all tasks from'),
        status: TASK_STATUS_ENUM,
        limit: z.number().optional().describe('Maximum number of tasks to return (default 100)'),
      },
    },
    async ({ projectId, workspaceSlug, status, limit }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      if (!projectId && !workspaceSlug) {
        return toolError('Provide either projectId or workspaceSlug.');
      }

      let tasks: TaskListItem[];

      try {
        if (projectId) {
          const query = `
            query Project($id: ID!) {
              project(id: $id) { tasks { ${TASK_LIST_FIELDS} } }
            }
          `;
          const json = await graphqlRequest(deps.backendUrl, token, query, { id: projectId });
          const project = json.data?.project as { tasks: TaskListItem[] } | null;

          if (json.errors || !project) {
            return toolError(
              `Failed to list tasks: ${JSON.stringify(json.errors ?? 'project not found')}`,
            );
          }
          tasks = project.tasks;
        } else {
          const result = await fetchWorkspaceTasks(
            deps.backendUrl,
            token,
            workspaceSlug!,
            'list tasks',
          );
          if (!Array.isArray(result)) return result;
          tasks = result;
        }

        if (status) {
          tasks = tasks.filter((t) => t.status === status);
        }

        return toolSuccess(JSON.stringify(tasks.slice(0, limit ?? 100), null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── search_projects ───────────────────────────────────────────────────
  server.registerTool(
    'search_projects',
    {
      description:
        'Search projects by name within a workspace. Performs case-insensitive substring matching.',
      inputSchema: {
        workspaceSlug: z.string().describe('The workspace slug'),
        query: z.string().describe('Search term to match against project names'),
      },
    },
    async ({ workspaceSlug, query: searchQuery }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const gql = `
        query Workspace($slug: String!) {
          workspace(slug: $slug) {
            projects { id name description defaultDirectory initiativeId createdAt }
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, gql, { slug: workspaceSlug });
        const workspace = json.data?.workspace as {
          projects: Array<{ name: string }>;
        } | null;

        if (json.errors || !workspace) {
          return toolError(
            `Failed to search projects: ${JSON.stringify(json.errors ?? 'workspace not found')}`,
          );
        }

        const lowerQuery = searchQuery.toLowerCase();
        const matches = workspace.projects.filter((p) => p.name.toLowerCase().includes(lowerQuery));

        return toolSuccess(JSON.stringify(matches, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── search_tasks ──────────────────────────────────────────────────────
  server.registerTool(
    'search_tasks',
    {
      description:
        'Search tasks by title within a workspace. Performs case-insensitive substring matching. Optionally filter by projectId and status. Returns up to `limit` results (default 100).',
      inputSchema: {
        workspaceSlug: z.string().describe('The workspace slug'),
        query: z.string().describe('Search term to match against task titles'),
        projectId: z.string().optional().describe('Filter to tasks in this project'),
        status: TASK_STATUS_ENUM,
        limit: z.number().optional().describe('Maximum number of results to return (default 100)'),
      },
    },
    async ({ workspaceSlug, query: searchQuery, projectId, status, limit }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      try {
        const result = await fetchWorkspaceTasks(
          deps.backendUrl,
          token,
          workspaceSlug,
          'search tasks',
        );
        if (!Array.isArray(result)) return result;

        const lowerQuery = searchQuery.toLowerCase();
        const matches = result.filter(
          (t) =>
            t.title.toLowerCase().includes(lowerQuery) &&
            (!projectId || t.projectId === projectId) &&
            (!status || t.status === status),
        );

        return toolSuccess(JSON.stringify(matches.slice(0, limit ?? 100), null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── search_initiatives ────────────────────────────────────────────────
  server.registerTool(
    'search_initiatives',
    {
      description:
        'Search initiatives by name within a workspace. Performs case-insensitive substring matching.',
      inputSchema: {
        workspaceSlug: z.string().describe('The workspace slug'),
        query: z.string().describe('Search term to match against initiative names'),
      },
    },
    async ({ workspaceSlug, query: searchQuery }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const gql = `
        query Workspace($slug: String!) {
          workspace(slug: $slug) {
            initiatives { id name description createdAt }
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, gql, { slug: workspaceSlug });
        const workspace = json.data?.workspace as {
          initiatives: Array<{ name: string }>;
        } | null;

        if (json.errors || !workspace) {
          return toolError(
            `Failed to search initiatives: ${JSON.stringify(json.errors ?? 'workspace not found')}`,
          );
        }

        const lowerQuery = searchQuery.toLowerCase();
        const matches = workspace.initiatives.filter((i) =>
          i.name.toLowerCase().includes(lowerQuery),
        );

        return toolSuccess(JSON.stringify(matches, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── list_labels ───────────────────────────────────────────────────────
  server.registerTool(
    'list_labels',
    {
      description: 'List all labels in a workspace.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID'),
      },
    },
    async ({ workspaceId }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const query = `
        query Labels($workspaceId: ID!) {
          labels(workspaceId: $workspaceId) { id name color workspaceId createdAt }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, { workspaceId });

        if (json.errors || !json.data?.labels) {
          return toolError(`Failed to list labels: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(JSON.stringify(json.data.labels, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── list_workspace_members ────────────────────────────────────────────
  server.registerTool(
    'list_workspace_members',
    {
      description: 'List members of a workspace. Email is omitted by default.',
      inputSchema: {
        workspaceSlug: z.string().describe('The workspace slug'),
        includeEmail: z
          .boolean()
          .optional()
          .describe('Include member email addresses in the response (default false)'),
      },
    },
    async ({ workspaceSlug, includeEmail }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const userFields = includeEmail ? 'id name email' : 'id name';
      const query = `
        query WorkspaceMembers($slug: String!) {
          workspace(slug: $slug) {
            members { id user { ${userFields} } role createdAt }
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, { slug: workspaceSlug });
        const workspace = json.data?.workspace as {
          members: unknown[];
        } | null;

        if (json.errors || !workspace) {
          return toolError(
            `Failed to list members: ${JSON.stringify(json.errors ?? 'workspace not found')}`,
          );
        }

        return toolSuccess(JSON.stringify(workspace.members, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );
}
