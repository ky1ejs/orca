import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  type McpToolsDeps,
  graphqlRequest,
  resolveToken,
  toolError,
  toolSuccess,
} from './helpers.js';

export function registerInitiativeTools(server: McpServer, deps: McpToolsDeps): void {
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
    'update_initiative',
    {
      description:
        'Update an initiative by ID. All fields are optional — only provided fields are changed.',
      inputSchema: {
        id: z.string().describe('The initiative ID'),
        name: z.string().optional().describe('New initiative name'),
        description: z.string().optional().describe('New initiative description'),
      },
    },
    async ({ id, name, description }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation UpdateInitiative($id: ID!, $input: UpdateInitiativeInput!) {
          updateInitiative(id: $id, input: $input) {
            id name description
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, {
          id,
          input: { name, description },
        });

        if (json.errors || !json.data?.updateInitiative) {
          return toolError(
            `Failed to update initiative: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.updateInitiative, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );

  server.registerTool(
    'delete_initiative',
    {
      description: 'Delete an initiative by ID.',
      inputSchema: {
        id: z.string().describe('The initiative ID to delete'),
      },
    },
    async ({ id }) => {
      const token = resolveToken(deps.getToken);
      if (typeof token !== 'string') return token;

      const mutation = `
        mutation ArchiveInitiative($id: ID!) {
          archiveInitiative(id: $id) {
            id archivedAt
          }
        }
      `;

      try {
        const json = await graphqlRequest(deps.backendUrl, token, mutation, { id });

        if (json.errors || !json.data?.archiveInitiative) {
          return toolError(
            `Failed to delete initiative: ${JSON.stringify(json.errors ?? 'no data')}`,
          );
        }

        return toolSuccess(JSON.stringify(json.data.archiveInitiative, null, 2));
      } catch (err) {
        return toolError(`Failed to reach Orca backend: ${err}`);
      }
    },
  );
}
