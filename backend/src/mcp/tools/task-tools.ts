import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { type McpToolsDeps, toolError, toolSuccess } from './helpers.js';

export function registerTaskTools(server: McpServer, deps: McpToolsDeps): void {
  server.registerTool(
    'create_task',
    {
      description: 'Create a new task in a workspace.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID'),
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        status: z
          .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])
          .optional()
          .describe('Task status'),
        priority: z
          .enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'])
          .optional()
          .describe('Task priority'),
        projectId: z.string().optional().describe('Project ID to associate with'),
        sourceTaskId: z
          .string()
          .optional()
          .describe('ID of the task this one was created from (adds a CREATED_FROM link)'),
      },
    },
    async ({ workspaceId, title, description, status, priority, projectId, sourceTaskId }) => {
      const mutation = `
        mutation CreateTask($input: CreateTaskInput!) {
          createTask(input: $input) {
            id displayId title description status priority projectId
          }
        }
      `;

      try {
        const json = await deps.graphql(mutation, {
          input: { workspaceId, title, description, status, priority, projectId, sourceTaskId },
        });

        if (json.errors || !json.data?.createTask) {
          return toolError(`Failed to create task: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(JSON.stringify(json.data.createTask, null, 2));
      } catch (err) {
        return toolError(`Failed to execute GraphQL operation: ${err}`);
      }
    },
  );

  server.registerTool(
    'update_task',
    {
      description:
        'Update a task by ID. All fields are optional — only provided fields are changed.',
      inputSchema: {
        id: z.string().describe('The task ID'),
        title: z.string().optional().describe('New task title'),
        description: z.string().optional().describe('New task description'),
        status: z
          .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])
          .optional()
          .describe('New task status'),
        priority: z
          .enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'])
          .optional()
          .describe('New task priority'),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe('Project ID to move the task to, or null to clear'),
        assigneeId: z
          .string()
          .nullable()
          .optional()
          .describe('User ID to assign the task to, or null to unassign'),
        labelIds: z.array(z.string()).optional().describe('Label IDs to set on the task'),
      },
    },
    async ({ id, title, description, status, priority, projectId, assigneeId, labelIds }) => {
      const mutation = `
        mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
          updateTask(id: $id, input: $input) {
            id displayId title description status priority projectId
            assignee { id name }
            labels { id name color }
          }
        }
      `;

      try {
        const json = await deps.graphql(mutation, {
          id,
          input: { title, description, status, priority, projectId, assigneeId, labelIds },
        });

        if (json.errors || !json.data?.updateTask) {
          return toolError(`Failed to update task: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(JSON.stringify(json.data.updateTask, null, 2));
      } catch (err) {
        return toolError(`Failed to execute GraphQL operation: ${err}`);
      }
    },
  );

  server.registerTool(
    'delete_task',
    {
      description: 'Delete a task by ID.',
      inputSchema: {
        id: z.string().describe('The task ID to delete'),
      },
    },
    async ({ id }) => {
      const mutation = `
        mutation ArchiveTask($id: ID!) {
          archiveTask(id: $id) {
            id archivedAt
          }
        }
      `;

      try {
        const json = await deps.graphql(mutation, { id });

        if (json.errors || !json.data?.archiveTask) {
          return toolError(`Failed to delete task: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(JSON.stringify(json.data.archiveTask, null, 2));
      } catch (err) {
        return toolError(`Failed to execute GraphQL operation: ${err}`);
      }
    },
  );
}
