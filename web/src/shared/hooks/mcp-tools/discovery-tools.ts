import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  type McpToolsDeps,
  graphqlRequest,
  resolveToken,
  toolError,
  toolSuccess,
} from './helpers.js';

export function registerDiscoveryTools(server: McpServer, deps: McpToolsDeps): void {
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
}
