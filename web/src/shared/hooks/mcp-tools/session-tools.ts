import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  type McpToolsDeps,
  graphqlRequest,
  resolveSession,
  toolError,
  toolSuccess,
} from './helpers.js';

export function registerSessionTools(server: McpServer, deps: McpToolsDeps): void {
  server.registerTool(
    'get_current_task',
    {
      description: 'Get details about the current Orca task assigned to this terminal session.',
      inputSchema: {},
    },
    async () => {
      const resolved = resolveSession(deps);
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
        status: z
          .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'])
          .describe('The new task status'),
      },
    },
    async ({ status }) => {
      const resolved = resolveSession(deps);
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

        if (json.errors || !json.data?.updateTask) {
          return toolError(`Failed to update task: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(`Task status updated to ${status}.`);
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );
}
