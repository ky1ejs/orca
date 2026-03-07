import { createYoga, createPubSub } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { schema } from './schema/index.js';
import { prisma } from './db/client.js';
import { getOrCreateToken, validateToken } from './auth/token.js';
import type { ServerContext } from './context.js';

const pubsub = createPubSub();
const { token: authToken, isNew: isNewToken } = getOrCreateToken();

if (isNewToken) {
  console.log('');
  console.log('='.repeat(60));
  console.log('  FIRST RUN - Auth token generated and saved to:');
  console.log('  ~/.orca/config.json');
  console.log('');
  console.log(`  Token: ${authToken}`);
  console.log('');
  console.log('  The Electron client reads this token automatically.');
  console.log('  For browser testing, set VITE_AUTH_TOKEN in web/.env');
  console.log('='.repeat(60));
  console.log('');
} else {
  console.log(`Auth token loaded from ~/.orca/config.json`);
}

const yoga = createYoga({
  schema,
  context: ({ request }): ServerContext => {
    const header = request.headers.get('authorization');
    if (!header) {
      throw new GraphQLError('Missing Authorization header', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
    const token = header.replace('Bearer ', '');
    if (!validateToken(token, authToken)) {
      throw new GraphQLError('Invalid auth token', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
    return { prisma, pubsub, authToken };
  },
  graphqlEndpoint: '/graphql',
});

const PORT = Number(process.env.PORT ?? 4000);

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch: yoga.fetch,
});

console.log(`Orca server running at http://127.0.0.1:${server.port}/graphql`);

export { server, authToken };
