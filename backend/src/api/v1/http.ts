import type { ApiKey, ApiKeyScope, PrismaClient, Workspace } from '@prisma/client';
import { authenticateApiKey, hasScopes } from '../../auth/api-key.js';

/** The public API's error codes, returned as `{ "error": { "code", "message" } }`. */
type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'length_required'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'idempotency_conflict'
  | 'not_found'
  | 'method_not_allowed'
  | 'storage_unavailable';

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function apiError(status: number, code: ApiErrorCode, message: string): Response {
  return jsonResponse(status, { error: { code, message } });
}

interface ApiCaller {
  apiKey: ApiKey;
  workspace: Workspace;
}

/**
 * Authenticates an API key and checks its scopes. Missing, malformed, unknown
 * and revoked keys all get the same 401, so the response never shows whether
 * a key exists. Only API keys are accepted here; session JWTs and OAuth tokens
 * are not.
 */
export async function authenticateApiRequest(
  request: Request,
  prisma: PrismaClient,
  requiredScopes: ApiKeyScope[],
): Promise<ApiCaller | Response> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const caller = token ? await authenticateApiKey(prisma, token) : null;
  if (!caller) return apiError(401, 'unauthorized', 'Missing or invalid API key');
  if (!hasScopes(caller.apiKey, requiredScopes)) {
    return apiError(403, 'forbidden', `This API key needs the ${requiredScopes.join(', ')} scope`);
  }
  return caller;
}
