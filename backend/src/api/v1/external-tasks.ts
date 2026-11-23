import type { PrismaClient } from '@prisma/client';
import type { PubSubLike } from '../../context.js';
import { getAttachmentStorage } from '../../attachments/storage.js';
import { apiError, authenticateApiRequest, jsonResponse } from './http.js';
import { lockExternalUser } from './external-user-lock.js';

const EXTERNAL_USER_REF = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * DELETE /api/v1/external-tasks?externalUserRef=…: deletes every external
 * task in the API key's workspace created for that reference, with its
 * attachments (files first) and audit history, and refuses new tasks for the
 * reference from then on. For a calling service that must delete a person's
 * data, e.g. when they delete their account.
 *
 * Text that agents or people copied out of these tasks elsewhere is not
 * touched. Matching nothing is not an error.
 */
export async function handlePurgeExternalTasks(
  request: Request,
  url: URL,
  deps: { prisma: PrismaClient; pubsub: PubSubLike },
): Promise<Response> {
  const { prisma, pubsub } = deps;
  const caller = await authenticateApiRequest(request, prisma, ['TASKS_DELETE_EXTERNAL']);
  if (caller instanceof Response) return caller;
  const workspaceId = caller.workspace.id;

  const externalUserRef = url.searchParams.get('externalUserRef');
  if (!externalUserRef || !EXTERNAL_USER_REF.test(externalUserRef)) {
    return apiError(
      400,
      'invalid_request',
      'externalUserRef is required: 1-128 letters, digits, "-" or "_"',
    );
  }

  // Under the same lock as task intake: record the deletion, then read the
  // tasks. A create still in flight either committed before this, and is
  // found here, or will find the record and be refused.
  const tasks = await prisma.$transaction(async (tx) => {
    await lockExternalUser(tx, workspaceId, externalUserRef);
    await tx.deletedExternalUser.upsert({
      where: { workspaceId_externalUserRef: { workspaceId, externalUserRef } },
      create: { workspaceId, externalUserRef },
      update: {},
    });
    return tx.task.findMany({
      where: { workspaceId, externalUserRef, isExternal: true },
      select: {
        id: true,
        displayId: true,
        attachments: { select: { storageKey: true } },
        sourceRelationships: { select: { targetTaskId: true } },
        targetRelationships: { select: { sourceTaskId: true } },
      },
    });
  });
  if (tasks.length === 0) {
    return jsonResponse(200, { deletedTaskCount: 0, deletedTaskDisplayIds: [] });
  }

  const storageKeys = tasks.flatMap((task) => task.attachments.map((a) => a.storageKey));
  if (storageKeys.length > 0) {
    const storage = getAttachmentStorage();
    if (!storage) {
      return apiError(503, 'storage_unavailable', 'Attachment storage is not configured');
    }
    // Files first: if this fails, the rows remain and a retry finds them again.
    await storage.delete(storageKeys);
  }

  const taskIds = tasks.map((task) => task.id);
  await prisma.$transaction([
    prisma.auditEvent.deleteMany({ where: { entityType: 'TASK', entityId: { in: taskIds } } }),
    // Attachments, relationships and pull request links cascade; idempotency
    // keys stay, without their task, so a retried create gets 410.
    prisma.task.deleteMany({ where: { id: { in: taskIds } } }),
  ]);

  // Open apps drop the deleted tasks and refresh tasks that linked to them.
  for (const id of taskIds) pubsub.publish('taskDeleted', { id, workspaceId });
  const purged = new Set(taskIds);
  const relatedIds = new Set(
    tasks
      .flatMap((t) => [
        ...t.sourceRelationships.map((r) => r.targetTaskId),
        ...t.targetRelationships.map((r) => r.sourceTaskId),
      ])
      .filter((id) => !purged.has(id)),
  );
  if (relatedIds.size > 0) {
    const related = await prisma.task.findMany({ where: { id: { in: [...relatedIds] } } });
    for (const task of related) pubsub.publish('taskChanged', task);
  }

  const displayIds = tasks.map((t) => t.displayId);
  // No audit event can describe this (its tasks are gone), so the server log
  // records which key deleted what. The reference itself is left out.
  console.log(
    `public api: purge by api key ${caller.apiKey.id} in workspace ${workspaceId} deleted ${displayIds.length} tasks: ${displayIds.join(', ')}`,
  );
  return jsonResponse(200, { deletedTaskCount: taskIds.length, deletedTaskDisplayIds: displayIds });
}
