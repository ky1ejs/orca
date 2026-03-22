import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { getSession } from '../../daemon/sessions.js';

export interface McpToolsLog {
  debug(msg: string): void;
  warn(msg: string): void;
}

export interface McpToolsDeps {
  backendUrl: string;
  getToken: () => string | null;
  log?: McpToolsLog;
}

interface ToolError {
  content: [{ type: 'text'; text: string }];
  isError: true;
}

function toolError(text: string): ToolError {
  return { content: [{ type: 'text', text }], isError: true };
}

function toolSuccess(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function resolveToken(getToken: () => string | null): string | ToolError {
  const token = getToken();
  if (!token) return toolError('Not authenticated with Orca backend.');
  return token;
}

function resolveSession(
  sessionId: string,
  getToken: () => string | null,
  log?: McpToolsLog,
): { taskId: string; token: string } | ToolError {
  const session = getSession(sessionId);
  if (!session) {
    log?.warn(`MCP resolveSession: session not found (sessionId=${sessionId})`);
    return toolError(`Session not found: ${sessionId}`);
  }
  if (!session.task_id) {
    log?.warn(`MCP resolveSession: session has no task_id (sessionId=${sessionId})`);
    return toolError(`No task is associated with session: ${sessionId}`);
  }
  const token = resolveToken(getToken);
  if (typeof token !== 'string') return token;
  return { taskId: session.task_id, token };
}

async function graphqlRequest(
  backendUrl: string,
  token: string,
  query: string,
  // eslint-disable-next-line no-restricted-syntax -- GraphQL variables are untyped at this boundary
  variables: Record<string, unknown>,
  // eslint-disable-next-line no-restricted-syntax -- raw GraphQL JSON response
): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
  const res = await fetch(`${backendUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  // eslint-disable-next-line no-restricted-syntax -- raw GraphQL JSON response
  return (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
}

export function createMcpServer(deps: McpToolsDeps): McpServer {
  const server = new McpServer({
    name: 'orca',
    version: '1.0.0',
  });

  server.registerTool(
    'get_current_task',
    {
      description: 'Get details about the current Orca task assigned to this terminal session.',
      inputSchema: {
        sessionId: z.string().describe('The ORCA_SESSION_ID from the environment'),
      },
    },
    async ({ sessionId }) => {
      const resolved = resolveSession(sessionId, deps.getToken, deps.log);
      if ('isError' in resolved) return resolved;

      const query = `
        query Task($id: ID!) {
          task(id: $id) {
            id
            displayId
            title
            description
            status
            priority
            project { id name }
            assignee { id name }
            labels { id name color }
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, resolved.token, query, {
          id: resolved.taskId,
        });

        if (json.errors || !json.data?.task) {
          return toolError(
            `Failed to fetch task: ${JSON.stringify(json.errors ?? 'task not found')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.task, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'update_task_status',
    {
      description: 'Update the status of the current Orca task.',
      inputSchema: {
        sessionId: z.string().describe('The ORCA_SESSION_ID from the environment'),
        status: z
          .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'])
          .describe('The new task status'),
      },
    },
    async ({ sessionId, status }) => {
      const resolved = resolveSession(sessionId, deps.getToken, deps.log);
      if ('isError' in resolved) return resolved;

      const mutation = `
        mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
          updateTask(id: $id, input: $input) {
            id
            status
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, resolved.token, mutation, {
          id: resolved.taskId,
          input: { status },
        });

        if (json.errors) {
          return toolError(`Failed to update task: ${JSON.stringify(json.errors)}`);
        }

        return toolSuccess(`Task status updated to ${status}.`);
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── Discovery tools ──────────────────────────────────────────────────

  server.registerTool(
    'list_workspaces',
    {
      description: 'List all workspaces the current user belongs to.',
      inputSchema: {},
    },
    async () => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const query = `
        query { workspaces { id name slug } }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, {});

        if (json.errors || !json.data?.workspaces) {
          return toolError(
            `Failed to list workspaces: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.workspaces, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'list_initiatives',
    {
      description: 'List initiatives in a workspace.',
      inputSchema: {
        workspaceSlug: z.string().describe('The workspace slug'),
      },
    },
    async ({ workspaceSlug }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const query = `
        query Workspace($slug: String!) {
          workspace(slug: $slug) {
            initiatives { id name description }
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, { slug: workspaceSlug });

        const workspace = json.data?.workspace as { initiatives: unknown[] } | null | undefined;
        if (json.errors || !workspace) {
          return toolError(
            `Failed to list initiatives: ${JSON.stringify(json.errors ?? 'workspace not found')}`,
          );
        }

        return toolSuccess(JSON.stringify(workspace.initiatives, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'list_projects',
    {
      description: 'List projects in a workspace.',
      inputSchema: {
        workspaceSlug: z.string().describe('The workspace slug'),
      },
    },
    async ({ workspaceSlug }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const query = `
        query Workspace($slug: String!) {
          workspace(slug: $slug) {
            projects { id name description initiativeId }
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, { slug: workspaceSlug });

        const workspace = json.data?.workspace as { projects: unknown[] } | null | undefined;
        if (json.errors || !workspace) {
          return toolError(
            `Failed to list projects: ${JSON.stringify(json.errors ?? 'workspace not found')}`,
          );
        }

        return toolSuccess(JSON.stringify(workspace.projects, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  // ── Creation tools ──────────────────────────────────────────────────

  server.registerTool(
    'create_initiative',
    {
      description: 'Create a new initiative in a workspace.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID'),
        name: z.string().describe('Initiative name'),
        description: z.string().optional().describe('Initiative description'),
      },
    },
    async ({ workspaceId, name, description }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation CreateInitiative($input: CreateInitiativeInput!) {
          createInitiative(input: $input) {
            id name description
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, {
          input: { workspaceId, name, description },
        });

        if (json.errors || !json.data?.createInitiative) {
          return toolError(
            `Failed to create initiative: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.createInitiative, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'create_project',
    {
      description: 'Create a new project in a workspace.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID'),
        name: z.string().describe('Project name'),
        description: z.string().optional().describe('Project description'),
        initiativeId: z.string().optional().describe('Initiative ID to associate with'),
      },
    },
    async ({ workspaceId, name, description, initiativeId }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id name description initiativeId
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, {
          input: { workspaceId, name, description, initiativeId },
        });

        if (json.errors || !json.data?.createProject) {
          return toolError(`Failed to create project: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(JSON.stringify(json.data.createProject, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'create_task',
    {
      description: 'Create a new task in a workspace.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID'),
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        status: z
          .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'])
          .optional()
          .describe('Task status'),
        priority: z
          .enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'])
          .optional()
          .describe('Task priority'),
        projectId: z.string().optional().describe('Project ID to associate with'),
      },
    },
    async ({ workspaceId, title, description, status, priority, projectId }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation CreateTask($input: CreateTaskInput!) {
          createTask(input: $input) {
            id displayId title description status priority projectId
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, {
          input: { workspaceId, title, description, status, priority, projectId },
        });

        if (json.errors || !json.data?.createTask) {
          return toolError(`Failed to create task: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(JSON.stringify(json.data.createTask, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  return server;
}
