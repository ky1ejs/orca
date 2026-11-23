import type { Prisma } from '@prisma/client';

/**
 * Takes a transaction-scoped lock on one external user in a workspace. Task
 * intake and the purge both take it, so they never interleave for one person.
 */
export async function lockExternalUser(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  externalUserRef: string,
): Promise<void> {
  // Raw SQL: Prisma has no API for Postgres advisory locks. The lock is
  // released when the transaction ends.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${workspaceId}:${externalUserRef}`}))`;
}
