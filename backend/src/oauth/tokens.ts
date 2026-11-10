import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getSecret } from '../auth/jwt.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './config.js';

/** A high-entropy opaque token (authorization codes, refresh tokens). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Opaque tokens are stored only as SHA-256 hashes. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** PKCE S256 check (RFC 7636 §4.6). */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) return false;
  const expected = Buffer.from(createHash('sha256').update(codeVerifier).digest('base64url'));
  const actual = Buffer.from(codeChallenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface AccessTokenClaims {
  userId: string;
  clientId: string;
  resource: string;
}

/**
 * Access tokens are JWTs whose audience is the MCP resource URL. `verifyJwt`
 * (used by /graphql and WebSocket auth) rejects any token with an audience,
 * so these tokens only work on /mcp.
 */
export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ client_id: claims.clientId })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setSubject(claims.userId)
    .setAudience(claims.resource)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string, resource: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      audience: resource,
      typ: 'at+jwt',
    });
    return payload.sub || null;
  } catch {
    return null;
  }
}
