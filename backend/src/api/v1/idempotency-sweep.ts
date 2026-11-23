import type { PrismaClient } from '@prisma/client';
import type { AttachmentStorage } from '../../attachments/storage.js';

/** A request that has held its key this long without a task has crashed. */
export const STALE_IDEMPOTENCY_KEY_MS = 10 * 60 * 1000;

/**
 * Removes idempotency keys whose request never committed a task (the server
 * stopped mid-request), with the files the request stored. A retry of that
 * request then succeeds instead of getting 409. Returns how many it removed.
 */
export async function sweepStaleIdempotencyKeys(
  prisma: PrismaClient,
  storage: AttachmentStorage | null,
  now: Date = new Date(),
): Promise<number> {
  const stale = await prisma.apiIdempotencyKey.findMany({
    where: { taskId: null, createdAt: { lt: new Date(now.getTime() - STALE_IDEMPOTENCY_KEY_MS) } },
  });
  let removed = 0;
  for (const row of stale) {
    try {
      if (row.pendingStorageKeys.length > 0) {
        if (!storage) continue; // Keep the row until its files can be deleted.
        await storage.delete(row.pendingStorageKeys);
      }
      await prisma.apiIdempotencyKey.deleteMany({
        where: { workspaceId: row.workspaceId, key: row.key, taskId: null },
      });
      removed += 1;
    } catch (error) {
      console.error(`idempotency sweep: failed for key ${row.key}`, error);
    }
  }
  return removed;
}
