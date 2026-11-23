import { describe, expect, it, vi } from 'vitest';
import {
  COMPLETED_IDEMPOTENCY_KEY_RETENTION_MS,
  STALE_IDEMPOTENCY_KEY_MS,
  sweepStaleIdempotencyKeys,
} from './idempotency-sweep.js';

function setup(rows: Array<{ key: string; pendingStorageKeys: string[] }>, releasedCount = 1) {
  const prisma = {
    apiIdempotencyKey: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          rows.map((r) => ({ workspaceId: 'ws1', reservationId: `res-${r.key}`, ...r })),
        ),
      deleteMany: vi.fn().mockResolvedValue({ count: releasedCount }),
    },
  };
  const storage = { kind: 'filesystem' as const, put: vi.fn(), get: vi.fn(), delete: vi.fn() };
  return { prisma, storage };
}

const NOW = new Date('2026-11-23T12:00:00Z');

describe('sweepStaleIdempotencyKeys', () => {
  it('looks only at unfinished keys older than the stale window', async () => {
    const { prisma, storage } = setup([]);
    await sweepStaleIdempotencyKeys(prisma as never, storage, NOW);
    expect(prisma.apiIdempotencyKey.findMany).toHaveBeenCalledWith({
      where: {
        completedAt: null,
        createdAt: { lt: new Date(NOW.getTime() - STALE_IDEMPOTENCY_KEY_MS) },
      },
    });
  });

  it('releases the key for its own reservation first, then deletes its files', async () => {
    const { prisma, storage } = setup([{ key: 'k1', pendingStorageKeys: ['attachments/ws1/a'] }]);
    expect(await sweepStaleIdempotencyKeys(prisma as never, storage, NOW)).toBe(1);
    expect(prisma.apiIdempotencyKey.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { workspaceId: 'ws1', key: 'k1', reservationId: 'res-k1', completedAt: null },
    });
    expect(storage.delete).toHaveBeenCalledWith(['attachments/ws1/a']);
    expect(prisma.apiIdempotencyKey.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      storage.delete.mock.invocationCallOrder[0],
    );
  });

  it('keeps the files of a request that finished in the meantime', async () => {
    const { prisma, storage } = setup([{ key: 'k1', pendingStorageKeys: ['a'] }], 0);
    expect(await sweepStaleIdempotencyKeys(prisma as never, storage, NOW)).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('releases a key even without storage, logging the files left behind', async () => {
    const { prisma } = setup([{ key: 'k1', pendingStorageKeys: ['a'] }]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sweepStaleIdempotencyKeys(prisma as never, null, NOW)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no storage'));
    error.mockRestore();
  });

  it('forgets finished keys after the retention period', async () => {
    const { prisma, storage } = setup([]);
    await sweepStaleIdempotencyKeys(prisma as never, storage, NOW);
    expect(prisma.apiIdempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: {
        completedAt: { lt: new Date(NOW.getTime() - COMPLETED_IDEMPOTENCY_KEY_RETENTION_MS) },
      },
    });
  });
});
