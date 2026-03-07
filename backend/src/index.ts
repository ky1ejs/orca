import { createYoga, createPubSub } from 'graphql-yoga';
import { schema } from './schema/index.js';
import { prisma } from './db/client.js';
import { getOrCreateToken } from './auth/token.js';
import type { ServerContext } from './context.js';

const pubsub = createPubSub();
const authToken = getOrCreateToken();

console.log(`Auth token: ${authToken}`);

const yoga = createYoga({
  schema,
  context: (): ServerContext => ({
    prisma,
    pubsub,
  }),
  graphqlEndpoint: '/graphql',
});

const PORT = Number(process.env.PORT ?? 4000);

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch: yoga.fetch,
});

console.log(`Orca server running at http://127.0.0.1:${server.port}/graphql`);

export { server };
