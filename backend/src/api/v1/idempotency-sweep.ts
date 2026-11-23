import type { PrismaClient } from '@prisma/client';
import type { AttachmentStorage } from '../../attachments/storage.js';

/** A request that has held its key this long without finishing has crashed. */
export const STALE_IDEMPOTENCY_KEY_MS = 10 * 60 * 1000;

/**
 * How long a finished key is kept, answering replays with its task (or 410).
 * Callers retry for far less than this.
 */
export const COMPLETED_IDEMPOTENCY_KEY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Releases idempotency keys whose request never finished (the server stopped
 * mid-request), and deletes the files that request stored; a retry then
 * succeeds instead of getting 409. Also forgets finished keys after the
 * retention period. Returns how many unfinished keys it released.
 */
export async function sweepStaleIdempotencyKeys(
  prisma: PrismaClient,
  storage: AttachmentStorage | null,
  now: Date = new Date(),
): Promise<number> {
  const stale = await prisma.apiIdempotencyKey.findMany({
    where: {
      completedAt: null,
      createdAt: { lt: new Date(now.getTime() - STALE_IDEMPOTENCY_KEY_MS) },
    },
  });
  let released = 0;
  for (const row of stale) {
    try {
      // Release the row first, and only if its request still hasn't finished.
      // If it finished in the meantime, its files belong to a task: keep them.
      const { count } = await prisma.apiIdempotencyKey.deleteMany({
        where: {
          workspaceId: row.workspaceId,
          key: row.key,
          reservationId: row.reservationId,
          completedAt: null,
        },
      });
      if (count === 0) continue;
      released += 1;
      if (row.pendingStorageKeys.length === 0) continue;
      if (storage) {
        await storage.delete(row.pendingStorageKeys);
      } else {
        console.error(
          `idempotency sweep: no storage to delete files of key ${row.key}: ${row.pendingStorageKeys.join(', ')}`,
        );
      }
    } catch (error) {
      console.error(`idempotency sweep: failed for key ${row.key}`, error);
    }
  }

  await prisma.apiIdempotencyKey.deleteMany({
    where: {
      completedAt: { lt: new Date(now.getTime() - COMPLETED_IDEMPOTENCY_KEY_RETENTION_MS) },
    },
  });
  return released;
}
