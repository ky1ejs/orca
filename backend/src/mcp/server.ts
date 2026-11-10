import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { GraphQLSchema } from 'graphql';
import { createYoga, type YogaServerInstance } from 'graphql-yoga';
import type { ServerContext } from '../context.js';
import { createLoaders } from '../loaders.js';
import { verifyJwt } from '../auth/jwt.js';
import { getPublicOrigin, mcpResourceUrl, protectedResourceMetadataUrl } from '../oauth/config.js';
import { verifyAccessToken } from '../oauth/tokens.js';
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

// Bearer tokens (not cookies) carry auth, so allowing any origin is safe and
// matches the `/graphql` CORS policy.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
};

// Matches the SDK transport's own cap; enforced here because the body is
// parsed before it reaches the transport.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function withCors(res: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.headers.set(key, value);
  return res;
}

function jsonRpcError(status: number, code: number, message: string, headers?: HeadersInit) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Reads the JSON-RPC body, rejecting oversized bodies and batch arrays. MCP
 * 2025-06-18 removed batching, and a batch would let one request fan out into
 * up to 100 tool calls.
 */
async function readBody(request: Request): Promise<{ body: unknown } | Response> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonRpcError(413, -32600, 'Request body too large');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return jsonRpcError(413, -32600, 'Request body too large');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonRpcError(400, -32700, 'Parse error: invalid JSON');
  }
  if (Array.isArray(body)) {
    return jsonRpcError(400, -32600, 'JSON-RPC batch requests are not supported');
  }
  return { body };
}

/**
 * Accepts an OAuth access token issued for this resource, or a session JWT
 * from `login` (for clients configured with a static bearer header).
 */
async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);

  const resource = mcpResourceUrl(getPublicOrigin(request));
  const oauthUserId = await verifyAccessToken(token, resource);
  if (oauthUserId) return oauthUserId;

  try {
    const payload = await verifyJwt(token);
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
 * Remote MCP endpoint (Streamable HTTP, stateless). Each request carries an
 * OAuth access token (see src/oauth) or a session JWT, and tools run GraphQL
 * operations in-process as that user.
 */
export function createMcpHandler({ schema, baseContext }: McpHandlerDeps) {
  const yoga = createYoga<McpServerContext, ServerContext>({
    schema,
    graphqlEndpoint: '/graphql',
    context: ({ mcpUserId }) => ({
      ...baseContext,
      userId: mcpUserId,
      loaders: createLoaders(baseContext.prisma),
    }),
  });

  return async (request: Request): Promise<Response> => withCors(await handle(request));

  async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    if (request.method !== 'POST') {
      return jsonRpcError(405, -32000, 'Method not allowed.', { Allow: 'POST, OPTIONS' });
    }

    const userId = await authenticate(request);
    if (!userId) {
      return jsonRpcError(401, -32001, 'Missing or invalid authentication', {
        // Points clients at the OAuth metadata so they can start the sign-in flow.
        'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(getPublicOrigin(request))}"`,
      });
    }

    const parsed = await readBody(request);
    if (parsed instanceof Response) return parsed;

    const mcpServer = createMcpServer({ graphql: createGraphqlExecutor(yoga, userId) });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await mcpServer.connect(transport);
      return await transport.handleRequest(request, { parsedBody: parsed.body });
    } catch (err) {
      console.error('mcp:request failed', err);
      return jsonRpcError(500, -32603, 'Internal server error');
    } finally {
      await transport.close();
      await mcpServer.close();
    }
  }
}
