import { Client, fetchExchange, subscriptionExchange } from 'urql';
import { createClient as createSSEClient } from 'graphql-sse';

const GRAPHQL_URL = 'http://localhost:4000/graphql';

export async function createGraphQLClient(): Promise<Client> {
  let token: string | null = null;
  try {
    token = await window.orca.db.getAuthToken();
  } catch {
    // getAuthToken may not be available yet (added by Agent 2B)
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const sseClient = createSSEClient({
    url: GRAPHQL_URL,
    headers,
  });

  return new Client({
    url: GRAPHQL_URL,
    fetchOptions: {
      headers,
    },
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
