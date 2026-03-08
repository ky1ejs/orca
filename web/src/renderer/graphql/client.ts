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

export interface GraphQLClientHandle {
  client: Client;
  dispose: () => void;
}

export async function createGraphQLClient(): Promise<GraphQLClientHandle> {
  const token = await getToken();

  if (!token) {
    console.warn('No auth token found — user needs to log in');
  }

  const sseClient = createSSEClient({
    url: GRAPHQL_URL,
    headers: () => authHeaders(cachedToken),
  });

  const client = new Client({
    url: GRAPHQL_URL,
    fetchOptions: () => ({
      headers: authHeaders(cachedToken),
    }),
    exchanges: [
      authErrorExchange,
      cacheExchange({
        updates: {
          Mutation: {
            createWorkspace(_result, _args, cache) {
              cache.invalidate('Query', 'workspaces');
            },
            updateWorkspace(_result, _args, cache) {
              cache.invalidate('Query', 'workspaces');
              cache.invalidate('Query', 'workspace');
            },
            deleteWorkspace(_result, args, cache) {
              cache.invalidate({ __typename: 'Workspace', id: args.id as string });
              cache.invalidate('Query', 'workspaces');
              cache.invalidate('Query', 'workspace');
            },
            createProject(_result, _args, cache) {
              cache.invalidate('Query', 'workspaces');
              cache.invalidate('Query', 'workspace');
            },
            deleteProject(_result, args, cache) {
              cache.invalidate({ __typename: 'Project', id: args.id as string });
              cache.invalidate('Query', 'workspaces');
              cache.invalidate('Query', 'workspace');
            },
            createTask(_result, _args, cache) {
              const task = _result.createTask as { projectId: string } | undefined;
              if (task) {
                cache.invalidate({ __typename: 'Project', id: task.projectId }, 'tasks');
                cache.invalidate('Query', 'workspaces');
                cache.invalidate('Query', 'workspace');
              }
            },
            deleteTask(_result, args, cache) {
              cache.invalidate({ __typename: 'Task', id: args.id as string });
              cache.invalidate('Query', 'workspaces');
              cache.invalidate('Query', 'workspace');
            },
            addMember(_result, _args, cache) {
              cache.invalidate('Query', 'workspace');
            },
            removeMember(_result, _args, cache) {
              cache.invalidate('Query', 'workspace');
              cache.invalidate('Query', 'workspaces');
            },
            updateMemberRole(_result, _args, cache) {
              cache.invalidate('Query', 'workspace');
            },
            cancelInvitation(_result, _args, cache) {
              cache.invalidate('Query', 'workspace');
            },
            acceptInvitation(_result, _args, cache) {
              cache.invalidate('Query', 'workspaces');
              cache.invalidate('Query', 'pendingInvitations');
            },
            declineInvitation(_result, _args, cache) {
              cache.invalidate('Query', 'pendingInvitations');
            },
          },
          Subscription: {
            projectChanged(_result, _args, cache) {
              cache.invalidate('Query', 'workspaces');
              cache.invalidate('Query', 'workspace');
            },
            taskChanged(_result, _args, cache) {
              const task = _result.taskChanged as { projectId: string } | undefined;
              if (task) {
                cache.invalidate({ __typename: 'Project', id: task.projectId }, 'tasks');
                cache.invalidate('Query', 'workspaces');
                cache.invalidate('Query', 'workspace');
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

  return {
    client,
    dispose: () => sseClient.dispose(),
  };
}
