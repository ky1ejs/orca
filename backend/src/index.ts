import { createYoga, createPubSub, type Plugin } from 'graphql-yoga';
import { GraphQLError, type DefinitionNode, type SelectionNode } from 'graphql';
import { schema } from './schema/index.js';
import { prisma } from './db/client.js';
import { verifyJwt } from './auth/jwt.js';
import type { ServerContext } from './context.js';

const pubsub = createPubSub();

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
    const header = request.headers.get('authorization');
    if (!header) {
      return { prisma, pubsub, userId: '' };
    }
    const token = header.replace('Bearer ', '');
    try {
      const payload = await verifyJwt(token);
      return { prisma, pubsub, userId: payload.sub };
    } catch {
      return { prisma, pubsub, userId: '' };
    }
  },
  graphqlEndpoint: '/graphql',
});

const PORT = Number(process.env.PORT ?? 4000);

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    return yoga.fetch(request);
  },
});

console.log(`Orca server running at http://0.0.0.0:${server.port}/graphql`);

export { server };
