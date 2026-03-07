import { Client, fetchExchange, subscriptionExchange, mapExchange } from 'urql';
import { cacheExchange } from '@urql/exchange-graphcache';
import { createClient as createSSEClient } from 'graphql-sse';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || __BACKEND_URL__;
export const GRAPHQL_URL = `${BACKEND_URL}/graphql`;

let cachedToken: string | null = null;
let onAuthError: (() => void) | null = null;

export function setOnAuthError(cb: () => void) {
  onAuthError = cb;
}

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (window.orca) {
    cachedToken = await window.orca.auth.readToken();
  } else {
    cachedToken = import.meta.env.VITE_AUTH_TOKEN ?? null;
  }
  return cachedToken;
}

export function clearCachedToken() {
  cachedToken = null;
}

export async function storeAuthToken(token: string) {
  clearCachedToken();
  if (window.orca) {
    await window.orca.auth.storeToken(token);
  }
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const authErrorExchange = mapExchange({
  onResult(result) {
    const errors = result.error?.graphQLErrors;
    if (errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')) {
      cachedToken = null;
      onAuthError?.();
    }
  },
});

export async function createGraphQLClient(): Promise<Client> {
  const token = await getToken();

  if (!token) {
    console.warn('No auth token found — user needs to log in');
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
      authErrorExchange,
      cacheExchange({
        updates: {
          Mutation: {
            createProject(_result, _args, cache) {
              cache.invalidate('Query', 'projects');
            },
            deleteProject(_result, args, cache) {
              cache.invalidate({ __typename: 'Project', id: args.id as string });
              cache.invalidate('Query', 'projects');
            },
            createTask(_result, _args, cache) {
              const task = _result.createTask as { projectId: string } | undefined;
              if (task) {
                cache.invalidate({ __typename: 'Project', id: task.projectId }, 'tasks');
                cache.invalidate('Query', 'projects');
              }
            },
            deleteTask(_result, args, cache) {
              cache.invalidate({ __typename: 'Task', id: args.id as string });
              cache.invalidate('Query', 'projects');
            },
          },
          Subscription: {
            projectChanged(_result, _args, cache) {
              cache.invalidate('Query', 'projects');
            },
            taskChanged(_result, _args, cache) {
              const task = _result.taskChanged as { projectId: string } | undefined;
              if (task) {
                cache.invalidate({ __typename: 'Project', id: task.projectId }, 'tasks');
                cache.invalidate('Query', 'projects');
              }
            },
          },
        },
      }),
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
