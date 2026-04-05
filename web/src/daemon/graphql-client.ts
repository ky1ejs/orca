/**
 * Lightweight GraphQL client for daemon-to-backend communication.
 */
import { logger } from './logger.js';

/**
 * Execute a GraphQL query/mutation against the backend.
 * Returns `null` when the backend is unreachable or returns a non-OK status.
 */
export async function graphqlRequest<T>(
  backendUrl: string,
  token: string,
  query: string,
  variables?: { [key: string]: string | number | boolean | null | undefined },
): Promise<T | null> {
  try {
    const res = await fetch(`${backendUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      logger.warn(`graphql-client: ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
