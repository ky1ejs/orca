/**
 * Executes a GraphQL operation as the authenticated MCP caller. The remote MCP
 * server runs operations in-process against the backend schema, so tools never
 * see a token or a backend URL.
 */
export type GraphqlExecutor = (
  query: string,
  // eslint-disable-next-line no-restricted-syntax -- GraphQL variables are untyped at this boundary
  variables: Record<string, unknown>,
) => Promise<GraphqlResult>;

export interface GraphqlResult {
  // eslint-disable-next-line no-restricted-syntax -- raw GraphQL result data
  data?: Record<string, unknown> | null;
  errors?: unknown[];
}

export interface McpToolsDeps {
  graphql: GraphqlExecutor;
}

export function toolError(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

export function toolSuccess(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
