import { SignJWT, jwtVerify } from 'jose';
import { getSecret } from './jwt.js';

interface OAuthStatePayload {
  workspaceId: string;
}

export async function createOAuthState(workspaceId: string): Promise<string> {
  return new SignJWT({ workspaceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getSecret());
}

export async function verifyOAuthState(state: string): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(state, getSecret());
  return { workspaceId: payload.workspaceId as string };
}
