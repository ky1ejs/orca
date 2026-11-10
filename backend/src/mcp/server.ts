import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { GraphQLSchema } from 'graphql';
import { createYoga, type YogaServerInstance } from 'graphql-yoga';
import type { ServerContext } from '../context.js';
import { createLoaders } from '../loaders.js';
import { verifyJwt } from '../auth/jwt.js';
import type { GraphqlExecutor, GraphqlResult, McpToolsDeps } from './tools/helpers.js';
import { registerDiscoveryTools } from './tools/discovery-tools.js';
import { registerDocTools } from './tools/doc-tools.js';
import { registerInitiativeTools } from './tools/initiative-tools.js';
import { registerProjectTools } from './tools/project-tools.js';
import { registerQueryTools } from './tools/query-tools.js';
import { registerRelationshipTools } from './tools/relationship-tools.js';
import { registerTaskTools } from './tools/task-tools.js';

function createMcpServer(deps: McpToolsDeps): McpServer {
  const server = new McpServer({ name: 'orca', version: '1.0.0' });

  registerDiscoveryTools(server, deps);
  registerDocTools(server, deps);
  registerTaskTools(server, deps);
  registerProjectTools(server, deps);
  registerInitiativeTools(server, deps);
  registerQueryTools(server, deps);
  registerRelationshipTools(server, deps);

  return server;
}

interface McpServerContext {
  mcpUserId: string;
}

/**
 * Builds a GraphQL executor bound to one user. Operations go through an
 * in-process Yoga instance, so they get the same execution, validation and
 * error masking as the public `/graphql` endpoint without a network hop.
 */
function createGraphqlExecutor(
  yoga: YogaServerInstance<McpServerContext, ServerContext>,
  userId: string,
): GraphqlExecutor {
  return async (query, variables) => {
    const res = await yoga.fetch(
      'http://orca.internal/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      },
      { mcpUserId: userId },
    );
    return (await res.json()) as GraphqlResult;
  };
}

function jsonRpcError(status: number, code: number, message: string, headers?: HeadersInit) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyJwt(header.slice('Bearer '.length));
    return payload.sub || null;
  } catch {
    return null;
  }
}

interface McpHandlerDeps {
  schema: GraphQLSchema;
  baseContext: Pick<ServerContext, 'prisma' | 'pubsub'>;
}

/**
 * Remote MCP endpoint (Streamable HTTP, stateless). Each request is
 * authenticated with the same JWT the GraphQL API accepts, and tools run
 * GraphQL operations in-process as that user.
 */
export function createMcpHandler({ schema, baseContext }: McpHandlerDeps) {
  const yoga = createYoga<McpServerContext, ServerContext>({
    schema,
    graphqlEndpoint: '/graphql',
    logging: false,
    context: ({ mcpUserId }) => ({
      ...baseContext,
      userId: mcpUserId,
      loaders: createLoaders(baseContext.prisma),
    }),
  });

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return jsonRpcError(405, -32000, 'Method not allowed.', { Allow: 'POST' });
    }

    const userId = await authenticate(request);
    if (!userId) {
      return jsonRpcError(401, -32001, 'Missing or invalid authentication', {
        'WWW-Authenticate': 'Bearer realm="orca"',
      });
    }

    const mcpServer = createMcpServer({ graphql: createGraphqlExecutor(yoga, userId) });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await mcpServer.connect(transport);
      return await transport.handleRequest(request);
    } catch (err) {
      console.error('mcp:request failed', err);
      return jsonRpcError(500, -32603, 'Internal server error');
    } finally {
      await transport.close();
      await mcpServer.close();
    }
  };
}
