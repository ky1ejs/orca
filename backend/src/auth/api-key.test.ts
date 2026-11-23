import { describe, expect, it, vi } from 'vitest';
import { authenticateApiKey, generateApiKey, hasScopes, isApiKeyToken } from './api-key.js';
import { hashToken } from '../oauth/tokens.js';

const WORKSPACE = { id: 'ws1', deletedAt: null };

function prismaReturning(row: unknown) {
  return { apiKey: { findUnique: vi.fn().mockResolvedValue(row) } };
}

describe('generateApiKey', () => {
  it('makes a prefixed key and stores only its hash', () => {
    const { key, hashedKey, displayHint } = generateApiKey();
    expect(key).toMatch(/^orca_[A-Za-z0-9_-]{43}$/);
    expect(hashedKey).toBe(hashToken(key));
    expect(hashedKey).not.toContain(key);
    expect(displayHint).toBe(key.slice(-4));
  });

  it('never repeats a key', () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe('isApiKeyToken', () => {
  it('recognises keys and rejects JWTs', () => {
    expect(isApiKeyToken('orca_abc')).toBe(true);
    expect(isApiKeyToken('eyJhbGciOiJIUzI1NiJ9.e30.x')).toBe(false);
  });
});

describe('authenticateApiKey', () => {
  it('returns the key and workspace for an active key', async () => {
    const { key, hashedKey } = generateApiKey();
    const prisma = prismaReturning({ id: 'k1', revokedAt: null, workspace: WORKSPACE });

    const result = await authenticateApiKey(prisma as never, key);

    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { hashedKey },
      include: { workspace: true },
    });
    expect(result).toEqual({ apiKey: { id: 'k1', revokedAt: null }, workspace: WORKSPACE });
  });

  it('rejects a token without the prefix before querying', async () => {
    const prisma = prismaReturning(null);
    expect(await authenticateApiKey(prisma as never, 'eyJ.jwt.token')).toBeNull();
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown key', async () => {
    expect(await authenticateApiKey(prismaReturning(null) as never, 'orca_x')).toBeNull();
  });

  it('rejects a revoked key', async () => {
    const prisma = prismaReturning({ id: 'k1', revokedAt: new Date(), workspace: WORKSPACE });
    expect(await authenticateApiKey(prisma as never, 'orca_x')).toBeNull();
  });

  it('rejects a key whose workspace was deleted', async () => {
    const prisma = prismaReturning({
      id: 'k1',
      revokedAt: null,
      workspace: { ...WORKSPACE, deletedAt: new Date() },
    });
    expect(await authenticateApiKey(prisma as never, 'orca_x')).toBeNull();
  });
});

describe('hasScopes', () => {
  it('requires every scope and fails closed on an empty list', () => {
    const key = { scopes: ['TASKS_CREATE' as const] };
    expect(hasScopes(key, ['TASKS_CREATE'])).toBe(true);
    expect(hasScopes(key, ['TASKS_CREATE', 'TASKS_DELETE_EXTERNAL'])).toBe(false);
    expect(() => hasScopes(key, [])).toThrow('at least one required scope');
  });
});
