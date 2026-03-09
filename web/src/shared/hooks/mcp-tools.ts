import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { getSession } from '../../daemon/sessions.js';

export interface McpToolsDeps {
  backendUrl: string;
  getToken: () => string | null;
}

interface ToolError {
  content: [{ type: 'text'; text: string }];
  isError: true;
}

function resolveSession(
  sessionId: string,
  getToken: () => string | null,
): { taskId: string; token: string } | ToolError {
  const session = getSession(sessionId);
  if (!session || !session.task_id) {
    return {
      content: [{ type: 'text', text: 'No task is associated with this session.' }],
      isError: true,
    };
  }
  const token = getToken();
  if (!token) {
    return {
      content: [{ type: 'text', text: 'Not authenticated with Orca backend.' }],
      isError: true,
    };
  }
  return { taskId: session.task_id, token };
}

async function graphqlRequest(
  backendUrl: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
  const res = await fetch(`${backendUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
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
      const resolved = resolveSession(sessionId, deps.getToken);
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
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to fetch task: ${JSON.stringify(json.errors ?? 'task not found')}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(json.data.task, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to reach Orca backend: ${err}` }],
          isError: true,
        };
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
      const resolved = resolveSession(sessionId, deps.getToken);
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
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to update task: ${JSON.stringify(json.errors)}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Task status updated to ${status}.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to reach Orca backend: ${err}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}
