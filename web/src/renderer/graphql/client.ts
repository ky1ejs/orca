import { Client, fetchExchange, subscriptionExchange, mapExchange } from 'urql';
import { type Cache, cacheExchange } from '@urql/exchange-graphcache';
import { createClient as createWSClient, CloseCode } from 'graphql-ws';

function invalidateAllWorkspaceQueries(cache: Cache) {
  const fields = cache.inspectFields('Query');
  fields
    .filter((f) => f.fieldName === 'workspace')
    .forEach((f) => {
      cache.invalidate('Query', 'workspace', f.arguments);
    });
}

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || __BACKEND_URL__;
export const GRAPHQL_URL = `${BACKEND_URL}/graphql`;
const WS_GRAPHQL_URL = GRAPHQL_URL.replace(/^http/, 'ws');

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

function isForbiddenClose(event: unknown): boolean {
  return (
    event != null &&
    typeof event === 'object' &&
    'code' in event &&
    event.code === CloseCode.Forbidden
  );
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

  const wsClient = createWSClient({
    url: WS_GRAPHQL_URL,
    connectionParams: () => ({ token: cachedToken }),
    // Retry indefinitely on transient failures (network blips, server restarts).
    // Auth failures (4403 Forbidden) are excluded via shouldRetry below.
    retryAttempts: Infinity,
    retryWait: async (retries) => {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** retries, 30_000)));
    },
    shouldRetry: (errOrCloseEvent) => !isForbiddenClose(errOrCloseEvent),
    keepAlive: 10_000,
    on: {
      // authErrorExchange only sees HTTP errors, so handle WS auth rejections here
      closed: (event) => {
        if (isForbiddenClose(event)) {
          cachedToken = null;
          onAuthError?.();
        }
      },
    },
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
              invalidateAllWorkspaceQueries(cache);
            },
            deleteWorkspace(_result, args, cache) {
              cache.invalidate({ __typename: 'Workspace', id: args.id as string });
              cache.invalidate('Query', 'workspaces');
              invalidateAllWorkspaceQueries(cache);
            },
            createProject(_result, _args, cache) {
              cache.invalidate('Query', 'workspaces');
              invalidateAllWorkspaceQueries(cache);
            },
            deleteProject(_result, args, cache) {
              cache.invalidate({ __typename: 'Project', id: args.id as string });
              cache.invalidate('Query', 'workspaces');
              invalidateAllWorkspaceQueries(cache);
            },
            createTask(_result, _args, cache) {
              const task = _result.createTask as { projectId: string | null } | undefined;
              if (task) {
                if (task.projectId) {
                  cache.invalidate({ __typename: 'Project', id: task.projectId }, 'tasks');
                }
                cache.invalidate('Query', 'workspaces');
                invalidateAllWorkspaceQueries(cache);
              }
            },
            deleteTask(_result, args, cache) {
              cache.invalidate({ __typename: 'Task', id: args.id as string });
              cache.invalidate('Query', 'workspaces');
              invalidateAllWorkspaceQueries(cache);
            },
            addMember(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            removeMember(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
              cache.invalidate('Query', 'workspaces');
            },
            updateMemberRole(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            cancelInvitation(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            createLabel(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            updateLabel(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            deleteLabel(_result, args, cache) {
              cache.invalidate({ __typename: 'Label', id: args.id as string });
              invalidateAllWorkspaceQueries(cache);
            },
            completeGitHubInstallation(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            removeGitHubInstallation(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            updateObservedRepositories(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
            },
            updateWorkspaceSettings(_result, _args, cache) {
              invalidateAllWorkspaceQueries(cache);
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
              invalidateAllWorkspaceQueries(cache);
            },
            taskChanged(_result, _args, cache) {
              const task = _result.taskChanged as
                | { id: string; projectId: string | null }
                | undefined;
              if (task) {
                // Invalidate project task lists for structural changes
                // (task created/deleted/moved). Don't invalidate the Task
                // entity itself — graphcache already normalized the
                // subscription payload into the cache.
                if (task.projectId) {
                  cache.invalidate({ __typename: 'Project', id: task.projectId }, 'tasks');
                }
                invalidateAllWorkspaceQueries(cache);
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
              const dispose = wsClient.subscribe(
                { query: operation.query!, variables: operation.variables },
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
    dispose: () => wsClient.dispose(),
  };
}
