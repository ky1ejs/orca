import type { ApiKey, ApiKeyScope, PrismaClient, Workspace } from '@prisma/client';
import { hashToken, randomToken } from '../oauth/tokens.js';

/**
 * Every API key starts with this prefix. It lets auth code tell an API key
 * from a JWT without parsing it, and lets secret scanners recognise leaks.
 */
const API_KEY_PREFIX = 'orca_';

const DISPLAY_HINT_LENGTH = 4;

interface GeneratedApiKey {
  /** The plaintext key. Shown to the person once and never stored. */
  key: string;
  hashedKey: string;
  displayHint: string;
}

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomToken()}`;
  return {
    key,
    hashedKey: hashToken(key),
    displayHint: key.slice(-DISPLAY_HINT_LENGTH),
  };
}

/** Whether a bearer token is shaped like an API key rather than a JWT. */
export function isApiKeyToken(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/**
 * Resolves a bearer token to an active API key and its workspace.
 *
 * Returns null for anything that is not a usable key: a malformed token, an
 * unknown or revoked key, or a key whose workspace was deleted. Callers
 * should give all of these the same response, so the reply never reveals
 * whether a key exists.
 *
 * The lookup goes through the unique index on the SHA-256 hash, so no
 * comparison of secret material happens in application code.
 */
export async function authenticateApiKey(
  prisma: PrismaClient,
  token: string,
): Promise<{ apiKey: ApiKey; workspace: Workspace } | null> {
  if (!isApiKeyToken(token)) return null;

  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey: hashToken(token) },
    include: { workspace: true },
  });
  if (!apiKey || apiKey.revokedAt || apiKey.workspace.deletedAt) return null;

  const { workspace, ...key } = apiKey;
  return { apiKey: key, workspace };
}

export function hasScopes(apiKey: Pick<ApiKey, 'scopes'>, required: ApiKeyScope[]): boolean {
  return required.every((scope) => apiKey.scopes.includes(scope));
}
