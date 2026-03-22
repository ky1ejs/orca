import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  type McpToolsDeps,
  graphqlRequest,
  resolveToken,
  toolError,
  toolSuccess,
} from './helpers.js';

export function registerProjectTools(server: McpServer, deps: McpToolsDeps): void {
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
    'update_project',
    {
      description:
        'Update a project by ID. All fields are optional — only provided fields are changed.',
      inputSchema: {
        id: z.string().describe('The project ID'),
        name: z.string().optional().describe('New project name'),
        description: z.string().optional().describe('New project description'),
        defaultDirectory: z
          .string()
          .nullable()
          .optional()
          .describe('New default directory path, or null to clear'),
        initiativeId: z
          .string()
          .nullable()
          .optional()
          .describe('Initiative ID to associate with, or null to disassociate'),
      },
    },
    async ({ id, name, description, defaultDirectory, initiativeId }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id name description defaultDirectory initiativeId
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, {
          id,
          input: { name, description, defaultDirectory, initiativeId },
        });

        if (json.errors || !json.data?.updateProject) {
          return toolError(`Failed to update project: ${JSON.stringify(json.errors ?? 'no data')}`);
        }

        return toolSuccess(JSON.stringify(json.data.updateProject, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'archive_project',
    {
      description: 'Archive a project by ID.',
      inputSchema: {
        id: z.string().describe('The project ID to archive'),
      },
    },
    async ({ id }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation ArchiveProject($id: ID!) {
          archiveProject(id: $id) {
            id archivedAt
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, { id });

        if (json.errors || !json.data?.archiveProject) {
          return toolError(
            `Failed to archive project: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.archiveProject, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );
}
