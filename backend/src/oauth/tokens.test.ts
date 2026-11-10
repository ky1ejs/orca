import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from '../auth/jwt.js';
import {
  hashToken,
  randomToken,
  signAccessToken,
  verifyAccessToken,
  verifyPkce,
} from './tokens.js';

const RESOURCE = 'https://orca.example/mcp';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-oauth-tests';
});

describe('verifyPkce', () => {
  const verifier = 'a'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  it('accepts the matching verifier', () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it('rejects a different verifier', () => {
    expect(verifyPkce('b'.repeat(43), challenge)).toBe(false);
  });

  it('rejects verifiers outside the RFC 7636 length and charset', () => {
    expect(verifyPkce('short', challenge)).toBe(false);
    expect(verifyPkce(`${'a'.repeat(42)}!`, challenge)).toBe(false);
  });
});

describe('opaque tokens', () => {
  it('are random and hashed deterministically', () => {
    const token = randomToken();
    expect(token).not.toBe(randomToken());
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('access tokens', () => {
  it('verify only for their resource', async () => {
    const token = await signAccessToken({ userId: 'u1', clientId: 'c1', resource: RESOURCE });
    expect(await verifyAccessToken(token, RESOURCE)).toBe('u1');
    expect(await verifyAccessToken(token, 'https://other.example/mcp')).toBeNull();
  });

  it('are rejected by the session verifier used for /graphql', async () => {
    const token = await signAccessToken({ userId: 'u1', clientId: 'c1', resource: RESOURCE });
    await expect(verifyJwt(token)).rejects.toThrow();
  });

  it('are distinct from session JWTs', async () => {
    const session = await signJwt({ sub: 'u1', email: 'u1@example.com' });
    expect(await verifyAccessToken(session, RESOURCE)).toBeNull();
    await expect(verifyJwt(session)).resolves.toMatchObject({ sub: 'u1' });
  });
});
