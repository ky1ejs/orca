import { getSession } from '../../../daemon/sessions.js';

export interface McpToolsLog {
  debug(msg: string): void;
  warn(msg: string): void;
}

export interface McpToolsDeps {
  backendUrl: string;
  getToken: () => string | null;
  log?: McpToolsLog;
  sessionId?: string;
}

interface ToolError {
  content: [{ type: 'text'; text: string }];
  isError: true;
}

export function toolError(text: string): ToolError {
  return { content: [{ type: 'text', text }], isError: true };
}

export function toolSuccess(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function resolveToken(getToken: () => string | null): string | ToolError {
  const token = getToken();
  if (!token) return toolError('Not authenticated with Orca backend.');
  return token;
}

export function resolveSession(deps: McpToolsDeps): { taskId: string; token: string } | ToolError {
  const sessionId = deps.sessionId;
  if (!sessionId) {
    deps.log?.warn('MCP resolveSession: no session ID provided via header');
    return toolError(
      'No session ID provided. Ensure the X-Orca-Session-Id header is set (usually sourced from ORCA_SESSION_ID in the MCP settings).',
    );
  }
  const session = getSession(sessionId);
  if (!session) {
    deps.log?.warn(`MCP resolveSession: session not found (sessionId=${sessionId})`);
    return toolError(`Session not found: ${sessionId}`);
  }
  if (!session.task_id) {
    deps.log?.warn(`MCP resolveSession: session has no task_id (sessionId=${sessionId})`);
    return toolError(`No task is associated with session: ${sessionId}`);
  }
  const token = resolveToken(deps.getToken);
  if (typeof token !== 'string') return token;
  return { taskId: session.task_id, token };
}

export async function graphqlRequest(
  backendUrl: string,
  token: string,
  query: string,
  // eslint-disable-next-line no-restricted-syntax -- GraphQL variables are untyped at this boundary
  variables: Record<string, unknown>,
  // eslint-disable-next-line no-restricted-syntax -- raw GraphQL JSON response
): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
  const res = await fetch(`${backendUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  // eslint-disable-next-line no-restricted-syntax -- raw GraphQL JSON response
  return (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
}
