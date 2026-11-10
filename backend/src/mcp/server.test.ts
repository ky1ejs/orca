import { beforeAll, describe, expect, it } from 'vitest';
import { createSchema } from 'graphql-yoga';
import type { PrismaClient } from '@prisma/client';
import { signJwt } from '../auth/jwt.js';
import type { ServerContext } from '../context.js';
import { pubsub } from '../pubsub.js';
import { createMcpHandler } from './server.js';

const schema = createSchema<ServerContext>({
  typeDefs: /* GraphQL */ `
    type Workspace {
      id: ID!
      name: String!
      slug: String!
    }
    type Query {
      workspaces: [Workspace!]!
    }
  `,
  resolvers: {
    Query: {
      workspaces: (_parent, _args, ctx) => [
        { id: 'ws1', name: `Workspace of ${ctx.userId}`, slug: 'personal' },
      ],
    },
  },
});

const handler = createMcpHandler({
  schema,
  baseContext: { prisma: {} as PrismaClient, pubsub },
});

function rpc(body: object, token?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }),
  });
}

let token: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-mcp-tests';
  token = await signJwt({ sub: 'user1', email: 'user1@example.com' });
});

describe('createMcpHandler', () => {
  it('rejects non-POST requests', async () => {
    const res = await handler(new Request('http://localhost/mcp', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('rejects requests without a bearer token', async () => {
    const res = await handler(rpc({ method: 'tools/list' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
  });

  it('rejects requests with an invalid token', async () => {
    const res = await handler(rpc({ method: 'tools/list' }, 'not-a-jwt'));
    expect(res.status).toBe(401);
  });

  it('lists tools for an authenticated caller', async () => {
    const res = await handler(rpc({ method: 'tools/list' }, token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain('list_workspaces');
    expect(names).toContain('create_task');
    expect(names).not.toContain('get_current_task');
    expect(names).not.toContain('get_logs');
  });

  it('runs GraphQL tools as the authenticated user', async () => {
    const res = await handler(
      rpc({ method: 'tools/call', params: { name: 'list_workspaces', arguments: {} } }, token),
    );
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    expect(JSON.parse(body.result.content[0].text)).toEqual([
      { id: 'ws1', name: 'Workspace of user1', slug: 'personal' },
    ]);
  });

  it('surfaces GraphQL errors as tool errors', async () => {
    const res = await handler(
      rpc(
        {
          method: 'tools/call',
          params: { name: 'list_labels', arguments: { workspaceId: 'ws1' } },
        },
        token,
      ),
    );
    const body = (await res.json()) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Failed to list labels');
  });
});
