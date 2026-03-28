import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpToolsDeps } from './mcp-tools/helpers.js';
import { registerDiscoveryTools } from './mcp-tools/discovery-tools.js';
import { registerInitiativeTools } from './mcp-tools/initiative-tools.js';
import { registerProjectTools } from './mcp-tools/project-tools.js';
import { registerSessionTools } from './mcp-tools/session-tools.js';
import { registerQueryTools } from './mcp-tools/query-tools.js';
import { registerTaskTools } from './mcp-tools/task-tools.js';

export type { McpToolsDeps } from './mcp-tools/helpers.js';

export function createMcpServer(deps: McpToolsDeps): McpServer {
  const server = new McpServer({
    name: 'orca',
    version: '1.0.0',
  });

  registerSessionTools(server, deps);
  registerDiscoveryTools(server, deps);
  registerTaskTools(server, deps);
  registerProjectTools(server, deps);
  registerInitiativeTools(server, deps);
  registerQueryTools(server, deps);

  return server;
}
