import type { Prisma } from '@prisma/client';

/**
 * Allocates the next task number in a workspace and its display ID (e.g.
 * CUT-42). Call inside the transaction that creates the task: the atomic
 * increment takes a row lock, which serializes concurrent creates.
 */
export async function allocateTaskNumber(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<{ sequenceNumber: number; displayId: string }> {
  const workspace = await tx.workspace.update({
    where: { id: workspaceId },
    data: { taskCounter: { increment: 1 } },
  });
  return {
    sequenceNumber: workspace.taskCounter,
    displayId: `${workspace.slug.toUpperCase()}-${workspace.taskCounter}`,
  };
}
