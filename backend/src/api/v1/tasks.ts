import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { PubSubLike } from '../../context.js';
import { recordAuditEvent } from '../../audit/record-event.js';
import { allocateTaskNumber } from '../../db/task-number.js';
import { attachmentStorageKey, getAttachmentStorage } from '../../attachments/storage.js';
import { apiError, authenticateApiRequest, jsonResponse } from './http.js';
import {
  MAX_ATTACHMENTS_PER_TASK,
  isValidIdempotencyKey,
  taskInputSchema,
  validateAttachment,
  type ValidatedAttachment,
} from './task-input.js';

interface Deps {
  prisma: PrismaClient;
  pubsub: PubSubLike;
}

function taskResponse(status: number, task: { id: string; displayId: string }): Response {
  return jsonResponse(status, { id: task.id, displayId: task.displayId });
}

/**
 * The response for a key that's already reserved: the task if its request
 * finished, or 409 if it is still in progress (or crashed and awaits the sweep).
 */
async function existingKeyResponse(
  prisma: PrismaClient,
  workspaceId: string,
  key: string,
): Promise<Response> {
  const existing = await prisma.apiIdempotencyKey.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
    include: { task: { select: { id: true, displayId: true } } },
  });
  if (existing?.task) return taskResponse(200, existing.task);
  return apiError(
    409,
    'idempotency_conflict',
    'A request with this Idempotency-Key is still in progress; retry later',
  );
}

/**
 * POST /api/v1/tasks: creates an external task, with optional image
 * attachments, for the API key's workspace. See docs/api.md.
 *
 * Order matters for retries and crashes:
 * 1. Validate everything that doesn't write.
 * 2. Reserve the Idempotency-Key, recording the storage keys about to be used.
 * 3. Store the files.
 * 4. In one transaction, create the task and its attachments and attach the
 *    task to the key.
 * A failure after step 2 deletes the files and the key, so a retry starts
 * clean. A crash leaves the key without a task; the sweep removes it and its
 * files, and until then a retry gets 409.
 */
export async function handleCreateTask(request: Request, deps: Deps): Promise<Response> {
  const { prisma, pubsub } = deps;
  const caller = await authenticateApiRequest(request, prisma, ['TASKS_CREATE']);
  if (caller instanceof Response) return caller;
  const workspaceId = caller.workspace.id;

  const idempotencyKey = request.headers.get('idempotency-key');
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return apiError(
      400,
      'invalid_request',
      'Idempotency-Key header is required: 1-100 printable ASCII characters',
    );
  }
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return apiError(415, 'unsupported_media_type', 'Send multipart/form-data');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, 'invalid_request', 'The multipart body could not be parsed');
  }

  const taskPart = form.get('task');
  const taskJson = typeof taskPart === 'string' ? taskPart : await taskPart?.text();
  if (!taskJson) return apiError(400, 'invalid_request', 'The "task" part is required');
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(taskJson);
  } catch {
    return apiError(400, 'invalid_request', 'The "task" part is not valid JSON');
  }
  const parsed = taskInputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiError(400, 'invalid_request', `task.${issue.path.join('.')}: ${issue.message}`);
  }
  const input = parsed.data;

  const files = form.getAll('attachment');
  if (files.length > MAX_ATTACHMENTS_PER_TASK) {
    return apiError(400, 'invalid_request', `At most ${MAX_ATTACHMENTS_PER_TASK} attachments`);
  }
  const attachments: ValidatedAttachment[] = [];
  for (const [index, file] of files.entries()) {
    if (typeof file === 'string') {
      return apiError(400, 'invalid_request', `Attachment ${index + 1} must be a file`);
    }
    const result = await validateAttachment(file, index);
    if (typeof result === 'string') return apiError(400, 'invalid_request', result);
    attachments.push(result);
  }
  const storage = getAttachmentStorage();
  if (attachments.length > 0 && !storage) {
    return apiError(503, 'storage_unavailable', 'Attachment storage is not configured');
  }

  // Labels and the project must be in the key's workspace. A mismatch is a
  // configuration error on the caller's side, so it's 403 rather than 400.
  const labelIds = [...new Set(input.labelIds ?? [])];
  if (labelIds.length > 0) {
    const count = await prisma.label.count({ where: { id: { in: labelIds }, workspaceId } });
    if (count !== labelIds.length) {
      return apiError(403, 'forbidden', "One or more labels are not in this API key's workspace");
    }
  }
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (project?.workspaceId !== workspaceId) {
      return apiError(403, 'forbidden', "The project is not in this API key's workspace");
    }
  }

  const stored = attachments.map((attachment) => {
    const id = randomUUID();
    return { ...attachment, id, storageKey: attachmentStorageKey(workspaceId, id) };
  });
  try {
    await prisma.apiIdempotencyKey.create({
      data: {
        workspaceId,
        key: idempotencyKey,
        pendingStorageKeys: stored.map((a) => a.storageKey),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return existingKeyResponse(prisma, workspaceId, idempotencyKey);
    }
    throw error;
  }

  let task;
  try {
    for (const attachment of stored) {
      await storage!.put(attachment.storageKey, attachment.data, attachment.mimeType);
    }
    task = await prisma.$transaction(async (tx) => {
      const { sequenceNumber, displayId } = await allocateTaskNumber(tx, workspaceId);
      const created = await tx.task.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? 'NONE',
          projectId: input.projectId ?? null,
          workspaceId,
          sequenceNumber,
          displayId,
          isExternal: true,
          createdByApiKeyId: caller.apiKey.id,
          externalUserRef: input.externalUserRef ?? null,
          labels: labelIds.length ? { connect: labelIds.map((id) => ({ id })) } : undefined,
        },
      });
      if (stored.length > 0) {
        await tx.taskAttachment.createMany({
          data: stored.map((a) => ({
            id: a.id,
            taskId: created.id,
            workspaceId,
            filename: a.filename,
            mimeType: a.mimeType,
            byteSize: a.data.byteLength,
            storageKey: a.storageKey,
          })),
        });
      }
      await tx.apiIdempotencyKey.update({
        where: { workspaceId_key: { workspaceId, key: idempotencyKey } },
        data: { taskId: created.id, pendingStorageKeys: [] },
      });
      return created;
    });
  } catch (error) {
    // Undo everything this request wrote, so a retry starts clean.
    await storage
      ?.delete(stored.map((a) => a.storageKey))
      .catch((cleanupError) => console.error('api: failed to delete stored files', cleanupError));
    await prisma.apiIdempotencyKey
      .delete({ where: { workspaceId_key: { workspaceId, key: idempotencyKey } } })
      .catch((cleanupError) =>
        console.error('api: failed to release idempotency key', cleanupError),
      );
    throw error;
  }

  pubsub.publish('taskChanged', task);
  recordAuditEvent(prisma, {
    entityType: 'TASK',
    entityId: task.id,
    action: 'CREATED',
    actorType: 'SYSTEM',
    workspaceId,
  });
  return taskResponse(201, task);
}
