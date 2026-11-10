import { SignJWT, jwtVerify } from 'jose';

export function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
}

interface JwtPayload {
  sub: string;
  email: string;
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

/**
 * Verifies a session JWT from `login`/`register`. Tokens with an audience are
 * OAuth access tokens scoped to another resource (see src/oauth/tokens.ts)
 * and are rejected here.
 */
export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  if (payload.aud !== undefined) {
    throw new Error('Token is scoped to another resource');
  }
  return {
    sub: payload.sub as string,
    email: payload.email as string,
  };
}
