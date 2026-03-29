import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  type McpToolsDeps,
  graphqlRequest,
  resolveToken,
  toolError,
  toolSuccess,
} from './helpers.js';

export function registerRelationshipTools(server: McpServer, deps: McpToolsDeps): void {
  server.registerTool(
    'link_tasks',
    {
      description:
        'Create a relationship (link) between two tasks. For example, "ORCA-10 blocks ORCA-11".',
      inputSchema: {
        sourceTaskId: z.string().describe('The source task ID'),
        targetTaskId: z.string().describe('The target task ID'),
        type: z
          .enum(['BLOCKS', 'RELATES_TO', 'DUPLICATES'])
          .describe(
            'Relationship type: BLOCKS (source blocks target), RELATES_TO (bidirectional), DUPLICATES (source duplicates target)',
          ),
      },
    },
    async ({ sourceTaskId, targetTaskId, type }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation CreateTaskRelationship($input: CreateTaskRelationshipInput!) {
          createTaskRelationship(input: $input) {
            id type displayType
            relatedTask { id displayId title status }
            createdAt
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, {
          input: { sourceTaskId, targetTaskId, type },
        });

        if (json.errors || !json.data?.createTaskRelationship) {
          return toolError(
            `Failed to create task relationship: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.createTaskRelationship, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'unlink_tasks',
    {
      description: 'Remove a relationship (link) between tasks.',
      inputSchema: {
        id: z.string().describe('The relationship ID to remove'),
      },
    },
    async ({ id }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation RemoveTaskRelationship($id: ID!) {
          removeTaskRelationship(id: $id)
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, { id });

        if (json.errors || !json.data?.removeTaskRelationship) {
          return toolError(
            `Failed to remove task relationship: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess('Task relationship removed.');
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'list_task_links',
    {
      description: 'List all relationships (links) for a given task.',
      inputSchema: {
        taskId: z.string().describe('The task ID to list relationships for'),
      },
    },
    async ({ taskId }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const query = `
        query TaskRelationships($id: ID!) {
          task(id: $id) {
            id displayId
            relationships {
              id type displayType
              relatedTask { id displayId title status }
              createdAt
            }
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, query, { id: taskId });

        if (json.errors || !json.data?.task) {
          return toolError(
            `Failed to list task relationships: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.task, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );
}
