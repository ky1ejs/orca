import type { PrismaClient } from '@prisma/client';
import { UNUSED_CLIENT_TTL_MS } from './config.js';
import {
  authorizationServerMetadata,
  authorizeGet,
  authorizePost,
  corsPreflight,
  protectedResourceMetadata,
  registerClient,
  token,
} from './handlers.js';

/**
 * OAuth 2.1 authorization server for the remote MCP endpoint, following the
 * MCP authorization spec: protected resource metadata (RFC 9728),
 * authorization server metadata (RFC 8414), dynamic client registration
 * (RFC 7591), and the authorization code grant with PKCE and rotating
 * refresh tokens. Returns null for paths it does not own.
 */
export function createOAuthHandler(prisma: PrismaClient) {
  return async (request: Request, pathname: string): Promise<Response | null> => {
    const { method } = request;

    if (
      pathname === '/.well-known/oauth-protected-resource' ||
      pathname === '/.well-known/oauth-protected-resource/mcp'
    ) {
      if (method === 'OPTIONS') return corsPreflight();
      if (method === 'GET') return protectedResourceMetadata(request);
    }
    if (pathname === '/.well-known/oauth-authorization-server') {
      if (method === 'OPTIONS') return corsPreflight();
      if (method === 'GET') return authorizationServerMetadata(request);
    }
    if (pathname === '/oauth/register') {
      if (method === 'OPTIONS') return corsPreflight();
      if (method === 'POST') return registerClient(request, prisma);
    }
    if (pathname === '/oauth/authorize') {
      if (method === 'GET') return authorizeGet(request, prisma);
      if (method === 'POST') return authorizePost(request, prisma);
    }
    if (pathname === '/oauth/token') {
      if (method === 'OPTIONS') return corsPreflight();
      if (method === 'POST') return token(request, prisma);
    }
    return null;
  };
}

/**
 * Deletes expired authorization codes and refresh tokens, and registered
 * clients that never completed a sign-in. Registration is unauthenticated,
 * so without this, abandoned or abusive registrations would pile up.
 */
export async function pruneOAuthGrants(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  const [codes, tokens, clients] = await Promise.all([
    prisma.oAuthAuthorizationCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.oAuthRefreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.oAuthClient.deleteMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - UNUSED_CLIENT_TTL_MS) },
        authorizationCodes: { none: {} },
        refreshTokens: { none: {} },
      },
    }),
  ]);
  return codes.count + tokens.count + clients.count;
}
