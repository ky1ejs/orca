import { describe, expect, it, vi } from 'vitest';
import { STALE_IDEMPOTENCY_KEY_MS, sweepStaleIdempotencyKeys } from './idempotency-sweep.js';

function setup(rows: Array<{ key: string; pendingStorageKeys: string[] }>) {
  const prisma = {
    apiIdempotencyKey: {
      findMany: vi.fn().mockResolvedValue(rows.map((r) => ({ workspaceId: 'ws1', ...r }))),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = { kind: 'filesystem' as const, put: vi.fn(), get: vi.fn(), delete: vi.fn() };
  return { prisma, storage };
}

describe('sweepStaleIdempotencyKeys', () => {
  it('looks only at keys without a task older than the stale window', async () => {
    const { prisma, storage } = setup([]);
    const now = new Date('2026-11-23T12:00:00Z');
    await sweepStaleIdempotencyKeys(prisma as never, storage, now);
    expect(prisma.apiIdempotencyKey.findMany).toHaveBeenCalledWith({
      where: {
        taskId: null,
        createdAt: { lt: new Date(now.getTime() - STALE_IDEMPOTENCY_KEY_MS) },
      },
    });
  });

  it('deletes the stored files, then the key, only if it still has no task', async () => {
    const { prisma, storage } = setup([{ key: 'k1', pendingStorageKeys: ['attachments/ws1/a'] }]);
    expect(await sweepStaleIdempotencyKeys(prisma as never, storage)).toBe(1);
    expect(storage.delete).toHaveBeenCalledWith(['attachments/ws1/a']);
    expect(prisma.apiIdempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', key: 'k1', taskId: null },
    });
  });

  it('keeps a key whose files it cannot delete', async () => {
    const { prisma } = setup([{ key: 'k1', pendingStorageKeys: ['attachments/ws1/a'] }]);
    expect(await sweepStaleIdempotencyKeys(prisma as never, null)).toBe(0);
    expect(prisma.apiIdempotencyKey.deleteMany).not.toHaveBeenCalled();
  });

  it('carries on past a failure', async () => {
    const { prisma, storage } = setup([
      { key: 'k1', pendingStorageKeys: ['a'] },
      { key: 'k2', pendingStorageKeys: [] },
    ]);
    storage.delete.mockRejectedValueOnce(new Error('storage down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sweepStaleIdempotencyKeys(prisma as never, storage)).toBe(1);
    error.mockRestore();
  });
});
