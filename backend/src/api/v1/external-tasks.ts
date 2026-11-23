import type { PrismaClient } from '@prisma/client';
import { getAttachmentStorage } from '../../attachments/storage.js';
import { apiError, authenticateApiRequest, jsonResponse } from './http.js';

const EXTERNAL_USER_REF = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * DELETE /api/v1/external-tasks?externalUserRef=…: deletes every external
 * task in the API key's workspace created for that reference, with its
 * attachments (files first) and audit history. For a calling service that
 * must delete a person's data, e.g. when they delete their account.
 *
 * Text that agents or people copied out of these tasks elsewhere is not
 * touched. Matching nothing is not an error.
 */
export async function handlePurgeExternalTasks(
  request: Request,
  url: URL,
  prisma: PrismaClient,
): Promise<Response> {
  const caller = await authenticateApiRequest(request, prisma, ['TASKS_DELETE_EXTERNAL']);
  if (caller instanceof Response) return caller;

  const externalUserRef = url.searchParams.get('externalUserRef');
  if (!externalUserRef || !EXTERNAL_USER_REF.test(externalUserRef)) {
    return apiError(
      400,
      'invalid_request',
      'externalUserRef is required: 1-128 letters, digits, "-" or "_"',
    );
  }

  const tasks = await prisma.task.findMany({
    where: { workspaceId: caller.workspace.id, externalUserRef, isExternal: true },
    select: { id: true, attachments: { select: { storageKey: true } } },
  });
  if (tasks.length === 0) return jsonResponse(200, { deletedTaskCount: 0 });

  const storageKeys = tasks.flatMap((task) => task.attachments.map((a) => a.storageKey));
  const storage = getAttachmentStorage();
  if (storageKeys.length > 0) {
    if (!storage) {
      return apiError(503, 'storage_unavailable', 'Attachment storage is not configured');
    }
    // Files first: if this fails, the rows remain and a retry finds them again.
    await storage.delete(storageKeys);
  }

  const taskIds = tasks.map((task) => task.id);
  await prisma.$transaction([
    prisma.auditEvent.deleteMany({ where: { entityType: 'TASK', entityId: { in: taskIds } } }),
    // Attachments, relationships, pull request links and idempotency keys cascade.
    prisma.task.deleteMany({ where: { id: { in: taskIds } } }),
  ]);
  return jsonResponse(200, { deletedTaskCount: taskIds.length });
}
