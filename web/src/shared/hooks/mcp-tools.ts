import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpToolsDeps } from './mcp-tools/helpers.js';
import { registerDiscoveryTools } from './mcp-tools/discovery-tools.js';
import { registerDocTools } from './mcp-tools/doc-tools.js';
import { registerInitiativeTools } from './mcp-tools/initiative-tools.js';
import { registerPerfTools } from './mcp-tools/perf-tools.js';
import { registerProjectTools } from './mcp-tools/project-tools.js';
import { registerQueryTools } from './mcp-tools/query-tools.js';
import { registerRelationshipTools } from './mcp-tools/relationship-tools.js';
import { registerSessionTools } from './mcp-tools/session-tools.js';
import { registerTaskTools } from './mcp-tools/task-tools.js';

export type { McpToolsDeps } from './mcp-tools/helpers.js';

export function createMcpServer(deps: McpToolsDeps): McpServer {
  const server = new McpServer({
    name: 'orca',
    version: '1.0.0',
  });

  registerSessionTools(server, deps);
  registerDiscoveryTools(server, deps);
  registerDocTools(server, deps);
  registerTaskTools(server, deps);
  registerProjectTools(server, deps);
  registerInitiativeTools(server, deps);
  registerQueryTools(server, deps);
  registerPerfTools(server, deps);
  registerRelationshipTools(server, deps);

  return server;
}
