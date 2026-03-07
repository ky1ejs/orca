import { Client, fetchExchange, subscriptionExchange } from 'urql';
import { createClient as createSSEClient } from 'graphql-sse';

const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || '4000';
const GRAPHQL_URL = `http://localhost:${BACKEND_PORT}/graphql`;

let cachedToken: string | null = null;

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await window.orca.db.getAuthToken();
  return cachedToken;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function createGraphQLClient(): Promise<Client> {
  const token = await getToken();

  if (!token) {
    console.warn('No auth token found. Start the backend first to generate ~/.orca/config.json');
  }

  const sseClient = createSSEClient({
    url: GRAPHQL_URL,
    headers: () => authHeaders(cachedToken),
  });

  return new Client({
    url: GRAPHQL_URL,
    fetchOptions: () => ({
      headers: authHeaders(cachedToken),
    }),
    exchanges: [
      fetchExchange,
      subscriptionExchange({
        forwardSubscription(operation) {
          return {
            subscribe(sink) {
              const dispose = sseClient.subscribe(
                { query: operation.query, variables: operation.variables },
                sink,
              );
              return { unsubscribe: dispose };
            },
          };
        },
      }),
    ],
  });
}
