import { describe, expect, it, vi } from 'vitest';
import { apiKeyResolvers } from './api-key.js';
import { hashToken } from '../oauth/tokens.js';

const WORKSPACE = {
  id: 'ws1',
  name: 'Test',
  slug: 'test',
  taskCounter: 0,
  createdById: 'user1',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const API_KEY = {
  id: 'key1',
  workspaceId: 'ws1',
  name: 'cut-api',
  displayHint: 'abcd',
  hashedKey: 'hash',
  scopes: ['TASKS_CREATE'],
  createdById: 'user1',
  revokedAt: null,
  createdAt: new Date(),
};

function createMockContext(role: 'OWNER' | 'MEMBER' | null = 'OWNER') {
  const prisma = {
    workspace: { findUnique: vi.fn().mockResolvedValue(WORKSPACE) },
    workspaceMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue(role ? { workspaceId: 'ws1', userId: 'user1', role } : null),
    },
    apiKey: {
      findMany: vi.fn().mockResolvedValue([API_KEY]),
      findUnique: vi.fn().mockResolvedValue(API_KEY),
      create: vi.fn().mockImplementation(({ data }) => ({ id: 'key2', ...data })),
      update: vi.fn().mockImplementation(({ data }) => ({ ...API_KEY, ...data })),
    },
  };
  return {
    prisma,
    pubsub: { publish: vi.fn(), subscribe: vi.fn() },
    userId: 'user1',
    loaders: { userById: { load: vi.fn() } },
  };
}

const { Query, Mutation, ApiKey } = apiKeyResolvers;

function createKey(ctx: ReturnType<typeof createMockContext>, input: Record<string, unknown>) {
  return Mutation.createApiKey(
    {} as never,
    { input: { workspaceId: 'ws1', name: 'cut-api', scopes: ['TASKS_CREATE'], ...input } } as never,
    ctx as never,
  );
}

describe('api key resolvers', () => {
  describe('Query.apiKeys', () => {
    it('lists keys newest first for an owner', async () => {
      const ctx = createMockContext('OWNER');
      const result = await Query.apiKeys({} as never, { workspaceId: 'ws1' }, ctx as never);
      expect(result).toEqual([API_KEY]);
      expect(ctx.prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('hides keys from members who are not owners', async () => {
      const ctx = createMockContext('MEMBER');
      await expect(
        Query.apiKeys({} as never, { workspaceId: 'ws1' }, ctx as never),
      ).rejects.toThrow('Workspace not found');
      expect(ctx.prisma.apiKey.findMany).not.toHaveBeenCalled();
    });

    it('hides keys from non-members', async () => {
      const ctx = createMockContext(null);
      await expect(
        Query.apiKeys({} as never, { workspaceId: 'ws1' }, ctx as never),
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('Mutation.createApiKey', () => {
    it('returns the plaintext key once and stores only its hash', async () => {
      const ctx = createMockContext('OWNER');
      const result = await createKey(ctx, { name: '  cut-api  ' });

      expect(result.key).toMatch(/^orca_/);
      const { data } = ctx.prisma.apiKey.create.mock.calls[0][0];
      expect(data).toEqual({
        workspaceId: 'ws1',
        name: 'cut-api',
        displayHint: result.key.slice(-4),
        hashedKey: hashToken(result.key),
        scopes: ['TASKS_CREATE'],
        createdById: 'user1',
      });
      expect(JSON.stringify(data)).not.toContain(result.key);
    });

    it('removes duplicate scopes', async () => {
      const ctx = createMockContext('OWNER');
      await createKey(ctx, { scopes: ['TASKS_CREATE', 'TASKS_CREATE', 'TASKS_DELETE_EXTERNAL'] });
      expect(ctx.prisma.apiKey.create.mock.calls[0][0].data.scopes).toEqual([
        'TASKS_CREATE',
        'TASKS_DELETE_EXTERNAL',
      ]);
    });

    it('rejects members who are not owners', async () => {
      const ctx = createMockContext('MEMBER');
      await expect(createKey(ctx, {})).rejects.toThrow('Workspace not found');
      expect(ctx.prisma.apiKey.create).not.toHaveBeenCalled();
    });

    it('rejects a blank name', async () => {
      await expect(createKey(createMockContext(), { name: '   ' })).rejects.toThrow(
        'Name is required',
      );
    });

    it('rejects a name over 64 characters', async () => {
      await expect(createKey(createMockContext(), { name: 'x'.repeat(65) })).rejects.toThrow(
        'at most 64',
      );
    });

    it('rejects an empty scope list', async () => {
      await expect(createKey(createMockContext(), { scopes: [] })).rejects.toThrow(
        'at least one scope',
      );
    });
  });

  describe('Mutation.revokeApiKey', () => {
    it('sets revokedAt for an owner', async () => {
      const ctx = createMockContext('OWNER');
      const result = await Mutation.revokeApiKey({} as never, { id: 'key1' }, ctx as never);
      expect(result.revokedAt).toBeInstanceOf(Date);
      expect(ctx.prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('returns an already revoked key unchanged', async () => {
      const ctx = createMockContext('OWNER');
      const revoked = { ...API_KEY, revokedAt: new Date('2026-01-01') };
      ctx.prisma.apiKey.findUnique.mockResolvedValue(revoked);
      expect(await Mutation.revokeApiKey({} as never, { id: 'key1' }, ctx as never)).toBe(revoked);
      expect(ctx.prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('rejects members who are not owners', async () => {
      const ctx = createMockContext('MEMBER');
      await expect(
        Mutation.revokeApiKey({} as never, { id: 'key1' }, ctx as never),
      ).rejects.toThrow('Workspace not found');
      expect(ctx.prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for an unknown key', async () => {
      const ctx = createMockContext('OWNER');
      ctx.prisma.apiKey.findUnique.mockResolvedValue(null);
      await expect(
        Mutation.revokeApiKey({} as never, { id: 'nope' }, ctx as never),
      ).rejects.toThrow('API key not found');
    });
  });

  describe('ApiKey.createdBy', () => {
    it('loads the creator', async () => {
      const ctx = createMockContext();
      ctx.loaders.userById.load.mockResolvedValue({ id: 'user1' });
      expect(await ApiKey.createdBy(API_KEY as never, {}, ctx as never)).toEqual({
        id: 'user1',
      });
    });

    it('is null when the creator was deleted', async () => {
      const ctx = createMockContext();
      const result = await ApiKey.createdBy(
        { ...API_KEY, createdById: null } as never,
        {},
        ctx as never,
      );
      expect(result).toBeNull();
      expect(ctx.loaders.userById.load).not.toHaveBeenCalled();
    });
  });
});
