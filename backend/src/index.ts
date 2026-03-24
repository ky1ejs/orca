import { createYoga, type Plugin } from 'graphql-yoga';
import { GraphQLError, type DefinitionNode, type SelectionNode } from 'graphql';
import { makeHandler, handleProtocols } from 'graphql-ws/use/bun';
import { schema } from './schema/index.js';
import { prisma } from './db/client.js';
import { pubsub } from './pubsub.js';
import { verifyJwt } from './auth/jwt.js';
import { handleGitHubWebhook } from './webhooks/github.js';
import { handleGitHubCallback } from './webhooks/github-callback.js';
import { handleGitHubOAuthCallback } from './webhooks/github-oauth.js';
import type { ServerContext } from './context.js';
import { createLoaders } from './loaders.js';

const PUBLIC_MUTATIONS = ['login', 'register'];

// Plugin that enforces auth on all operations except public mutations
function useAuth(): Plugin<ServerContext> {
  return {
    onExecute({ args }) {
      const operation = args.document.definitions.find(
        (def: DefinitionNode) => def.kind === 'OperationDefinition',
      );
      if (
        operation &&
        operation.kind === 'OperationDefinition' &&
        operation.operation === 'mutation'
      ) {
        const allPublic = operation.selectionSet.selections.every(
          (sel: SelectionNode) => sel.kind === 'Field' && PUBLIC_MUTATIONS.includes(sel.name.value),
        );
        if (allPublic) return;
      }

      // Require auth for everything else
      if (!args.contextValue.userId) {
        throw new GraphQLError('Missing or invalid authentication', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
    },
  };
}

const yoga = createYoga({
  schema,
  cors: { origin: '*', credentials: true },
  plugins: [useAuth()],
  context: async ({ request }): Promise<ServerContext> => {
    const loaders = createLoaders(prisma);
    const header = request.headers.get('authorization');
    if (!header) {
      return { prisma, pubsub, userId: '', loaders };
    }
    const token = header.replace('Bearer ', '');
    try {
      const payload = await verifyJwt(token);
      return { prisma, pubsub, userId: payload.sub, loaders };
    } catch {
      return { prisma, pubsub, userId: '', loaders };
    }
  },
  graphqlEndpoint: '/graphql',
});

const PORT = Number(process.env.PORT ?? 4000);

const wsHandler = makeHandler({
  schema,
  // userId is resolved once in onConnect and stashed on ctx.extra
  context: (ctx) =>
    ({
      prisma,
      pubsub,
      userId: (ctx.extra as { userId?: string }).userId ?? '',
      loaders: createLoaders(prisma),
    }) satisfies ServerContext,
  onConnect: async (ctx) => {
    const token = ctx.connectionParams?.token as string | undefined;
    if (!token) {
      console.log('ws:connect rejected — no token');
      return false;
    }
    try {
      const payload = await verifyJwt(token);
      (ctx.extra as unknown as { userId: string }).userId = payload.sub;
      console.log(`ws:connect userId=${payload.sub}`);
      return true;
    } catch {
      console.log('ws:connect rejected — invalid token');
      return false;
    }
  },
  onClose: (_ctx, code, reason) => {
    console.log(`ws:close code=${code ?? 'none'} reason=${reason ?? 'none'}`);
  },
});

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    if (url.pathname === '/webhooks/github' && request.method === 'POST') {
      return handleGitHubWebhook(request);
    }
    if (url.pathname === '/github/callback' && request.method === 'GET') {
      return handleGitHubCallback(request);
    }
    if (url.pathname === '/github/oauth/callback' && request.method === 'GET') {
      return handleGitHubOAuthCallback(request);
    }

    if (url.pathname === '/graphql' && request.headers.get('upgrade') === 'websocket') {
      const protocol = handleProtocols(request.headers.get('sec-websocket-protocol') || '');
      if (!protocol) {
        return new Response('Bad Request', { status: 400 });
      }
      if (!server.upgrade(request, { headers: { 'sec-websocket-protocol': protocol } })) {
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      return undefined;
    }

    return yoga.fetch(request);
  },
  websocket: wsHandler,
});

console.log(`Orca server running at http://0.0.0.0:${server.port}/graphql`);

// Prune old webhook deliveries (>7 days) on startup
prisma.webhookDelivery
  .deleteMany({
    where: { processedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  })
  .then((result) => {
    if (result.count > 0) {
      console.log(`Pruned ${result.count} old webhook deliveries`);
    }
  })
  .catch(() => {
    // Non-critical — log and continue
  });

export { server };
