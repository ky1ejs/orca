import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSchema } from 'graphql-yoga';
import type { PrismaClient } from '@prisma/client';
import { signJwt } from '../auth/jwt.js';
import type { ServerContext } from '../context.js';
import { pubsub } from '../pubsub.js';
import { createMcpHandler } from './server.js';

const MANIFEST_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'tools.manifest.json');

const schema = createSchema<ServerContext>({
  typeDefs: /* GraphQL */ `
    type Workspace {
      id: ID!
      name: String!
      slug: String!
    }
    type Task {
      id: ID!
      workspace: Workspace!
    }
    type Query {
      workspaces: [Workspace!]!
      task(id: ID!): Task
    }
  `,
  resolvers: {
    Query: {
      workspaces: (_parent, _args, ctx) => {
        if (ctx.userId === 'explodes') throw new Error('db exploded');
        return [{ id: 'ws1', name: `Workspace of ${ctx.userId}`, slug: 'personal' }];
      },
      task: (_parent, args: { id: string }) =>
        args.id === 'task-in-ws1' ? { id: args.id, workspace: { id: 'ws1' } } : null,
    },
  },
});

const handler = createMcpHandler({
  schema,
  baseContext: { prisma: {} as PrismaClient, pubsub },
});

function post(body: string, token?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/mcp', { method: 'POST', headers, body });
}

function rpc(body: object, token?: string): Request {
  return post(JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }), token);
}

/** Connects a real SDK client (full initialize handshake) to the handler. */
async function connectClient(clientToken: string): Promise<Client> {
  const client = new Client({ name: 'test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${clientToken}` } },
    fetch: (input, init) => handler(new Request(input, init)),
  });
  await client.connect(transport);
  return client;
}

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };

let token: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-mcp-tests';
  token = await signJwt({ sub: 'user1', email: 'user1@example.com' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMcpHandler', () => {
  it('answers CORS preflight', async () => {
    const res = await handler(new Request('http://localhost/mcp', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('rejects other non-POST requests', async () => {
    const res = await handler(new Request('http://localhost/mcp', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('rejects requests without a bearer token', async () => {
    const res = await handler(rpc({ method: 'tools/list' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"',
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects requests with an invalid token', async () => {
    const res = await handler(rpc({ method: 'tools/list' }, 'not-a-jwt'));
    expect(res.status).toBe(401);
  });

  it('rejects JSON-RPC batches', async () => {
    const call = { jsonrpc: '2.0', method: 'tools/list' };
    const res = await handler(post(JSON.stringify([call, { ...call, id: 2 }]), token));
    expect(res.status).toBe(400);
  });

  it('rejects bodies over 4 MiB', async () => {
    const res = await handler(post(JSON.stringify({ pad: 'x'.repeat(4 * 1024 * 1024) }), token));
    expect(res.status).toBe(413);
  });

  it('rejects malformed JSON', async () => {
    const res = await handler(post('{', token));
    expect(res.status).toBe(400);
  });

  it('serves a real SDK client through the initialize handshake', async () => {
    const client = await connectClient(token);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('list_workspaces');
    expect(names).not.toContain('get_current_task');
    expect(names).not.toContain('get_logs');

    const result = (await client.callTool({
      name: 'list_workspaces',
      arguments: {},
    })) as ToolResult;
    expect(JSON.parse(result.content[0].text)).toEqual([
      { id: 'ws1', name: 'Workspace of user1', slug: 'personal' },
    ]);
    await client.close();
  });

  it('masks and logs unexpected resolver errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = await connectClient(await signJwt({ sub: 'explodes', email: 'x@example.com' }));
    const result = (await client.callTool({
      name: 'list_workspaces',
      arguments: {},
    })) as ToolResult;
    await client.close();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected error');
    expect(result.content[0].text).not.toContain('db exploded');
    expect(consoleError.mock.calls.flat().map(String).join('\n')).toContain('db exploded');
  });

  it('rejects a sourceTaskId outside the target workspace', async () => {
    const res = await handler(
      rpc(
        {
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: { workspaceId: 'ws1', title: 'T', sourceTaskId: 'ORCA-1' },
          },
        },
        token,
      ),
    );
    const body = (await res.json()) as { result: ToolResult };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('sourceTaskId ORCA-1 is not the UUID');
  });
});

/**
 * tools.manifest.json records the remote server's tool definitions. The web
 * package's MCP tests check its local copies of these tools against the same
 * file, so the two copies cannot drift without a failing test. Regenerate it
 * with `UPDATE_MCP_MANIFEST=1 bunx vitest run src/mcp`.
 */
describe('tool manifest', () => {
  it('matches the served tool definitions', async () => {
    const client = await connectClient(token);
    const { tools } = await client.listTools();
    await client.close();

    const served = tools
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (process.env.UPDATE_MCP_MANIFEST) {
      writeFileSync(MANIFEST_PATH, JSON.stringify(served, null, 2) + '\n');
    }
    expect(served).toEqual(JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')));
  });
});
