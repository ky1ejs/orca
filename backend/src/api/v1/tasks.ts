import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { PubSubLike } from '../../context.js';
import { recordAuditEvent } from '../../audit/record-event.js';
import { allocateTaskNumber } from '../../db/task-number.js';
import { attachmentStorageKey, getAttachmentStorage } from '../../attachments/storage.js';
import { apiError, authenticateApiRequest, jsonResponse } from './http.js';
import { acquireIntakeSlot } from './limits.js';
import { lockExternalUser } from './external-user-lock.js';
import {
  MAX_ATTACHMENTS_PER_TASK,
  isValidIdempotencyKey,
  requestFingerprint,
  taskInputSchema,
  validateAttachment,
  type ValidatedAttachment,
} from './task-input.js';

interface Deps {
  prisma: PrismaClient;
  pubsub: PubSubLike;
}

const ALLOWED_PARTS = new Set(['task', 'attachment']);

/** The create transaction found the person deleted, after this request began. */
class ExternalUserDeletedError extends Error {}
/** This request's reservation was released (by the sweep) before it committed. */
class ReservationLostError extends Error {}

function taskResponse(status: number, task: { id: string; displayId: string }): Response {
  return jsonResponse(status, { id: task.id, displayId: task.displayId });
}

function externalUserDeleted(): Response {
  return apiError(
    410,
    'external_user_deleted',
    "This externalUserRef's tasks were deleted; new tasks for it are refused",
  );
}

/**
 * The answer for a key that already has a row, or null if it has none:
 * - a different request under the same key: 422;
 * - finished: 200 with its task, or 410 if that task has since been deleted;
 * - still running (or crashed, until the sweep releases it): 409.
 */
async function existingKeyResponse(
  prisma: PrismaClient,
  workspaceId: string,
  key: string,
  fingerprint: string,
): Promise<Response | null> {
  const existing = await prisma.apiIdempotencyKey.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
    include: { task: { select: { id: true, displayId: true } } },
  });
  if (!existing) return null;
  if (existing.fingerprint !== fingerprint) {
    return apiError(
      422,
      'idempotency_key_reused',
      'This Idempotency-Key was used for a different request',
    );
  }
  if (existing.completedAt) {
    return existing.task
      ? taskResponse(200, existing.task)
      : apiError(410, 'task_deleted', 'The task this Idempotency-Key created has been deleted');
  }
  return apiError(
    409,
    'idempotency_conflict',
    'A request with this Idempotency-Key is still in progress; retry later',
  );
}

/**
 * POST /api/v1/tasks: creates an external task, with optional image
 * attachments, for the API key's workspace. See docs/api.md.
 */
export async function handleCreateTask(request: Request, deps: Deps): Promise<Response> {
  const caller = await authenticateApiRequest(request, deps.prisma, ['TASKS_CREATE']);
  if (caller instanceof Response) return caller;

  const slot = acquireIntakeSlot(caller.apiKey.id);
  if ('reason' in slot) {
    const response = apiError(429, 'rate_limited', slot.reason);
    response.headers.set('Retry-After', String(slot.retryAfterSeconds));
    return response;
  }
  try {
    return await createTask(request, deps, caller.apiKey, caller.workspace.id);
  } finally {
    slot.release();
  }
}

async function createTask(
  request: Request,
  { prisma, pubsub }: Deps,
  apiKey: { id: string; name: string; displayHint: string },
  workspaceId: string,
): Promise<Response> {
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
  const unknownPart = [...form.keys()].find((name) => !ALLOWED_PARTS.has(name));
  if (unknownPart) {
    return apiError(400, 'invalid_request', `Unexpected part "${unknownPart}"`);
  }
  const taskParts = form.getAll('task');
  if (taskParts.length !== 1) {
    return apiError(400, 'invalid_request', 'Send exactly one "task" part');
  }
  const taskJson = typeof taskParts[0] === 'string' ? taskParts[0] : await taskParts[0].text();
  const fileParts = form.getAll('attachment');
  if (fileParts.length > MAX_ATTACHMENTS_PER_TASK) {
    return apiError(400, 'invalid_request', `At most ${MAX_ATTACHMENTS_PER_TASK} attachments`);
  }
  const files: File[] = [];
  for (const [index, part] of fileParts.entries()) {
    if (typeof part === 'string') {
      return apiError(400, 'invalid_request', `Attachment ${index + 1} must be a file`);
    }
    files.push(part);
  }

  // A replay is answered before anything is validated, so it gets the same
  // answer even if, say, a label was deleted since the first request.
  const fingerprint = await requestFingerprint(taskJson, files);
  const replay = await existingKeyResponse(prisma, workspaceId, idempotencyKey, fingerprint);
  if (replay) return replay;

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
  const externalUserRef = input.externalUserRef ?? null;

  const attachments: ValidatedAttachment[] = [];
  for (const [index, file] of files.entries()) {
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
  // Cheap early refusal; the create transaction checks again under a lock.
  if (
    externalUserRef &&
    (await prisma.deletedExternalUser.findUnique({
      where: { workspaceId_externalUserRef: { workspaceId, externalUserRef } },
    }))
  ) {
    return externalUserDeleted();
  }

  // Reserve the key. Each attempt has its own reservationId, and only that
  // attempt can complete or release the row it wrote.
  const reservationId = randomUUID();
  const stored = attachments.map((attachment) => {
    const id = randomUUID();
    return { ...attachment, id, storageKey: attachmentStorageKey(workspaceId, id) };
  });
  try {
    await prisma.apiIdempotencyKey.create({
      data: {
        workspaceId,
        key: idempotencyKey,
        reservationId,
        fingerprint,
        externalUserRef,
        pendingStorageKeys: stored.map((a) => a.storageKey),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await existingKeyResponse(prisma, workspaceId, idempotencyKey, fingerprint);
      if (raced) return raced;
    }
    throw error;
  }
  const ownReservation = {
    workspaceId,
    key: idempotencyKey,
    reservationId,
    completedAt: null,
  };

  let task;
  try {
    for (const attachment of stored) {
      await storage!.put(attachment.storageKey, attachment.file, attachment.mimeType);
    }
    task = await prisma.$transaction(async (tx) => {
      if (externalUserRef) {
        // Serializes with the purge: either the purge finds this task, or
        // this transaction finds the purge's record and refuses.
        await lockExternalUser(tx, workspaceId, externalUserRef);
        const deleted = await tx.deletedExternalUser.findUnique({
          where: { workspaceId_externalUserRef: { workspaceId, externalUserRef } },
        });
        if (deleted) throw new ExternalUserDeletedError();
      }
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
          createdByApiKeyId: apiKey.id,
          externalUserRef,
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
            byteSize: a.file.size,
            storageKey: a.storageKey,
          })),
        });
      }
      const completed = await tx.apiIdempotencyKey.updateMany({
        where: ownReservation,
        data: { taskId: created.id, completedAt: new Date(), pendingStorageKeys: [] },
      });
      if (completed.count !== 1) throw new ReservationLostError();
      return created;
    });
  } catch (error) {
    // Undo what this attempt wrote, so a retry starts clean.
    await storage
      ?.delete(stored.map((a) => a.storageKey))
      .catch((cleanupError) => console.error('api: failed to delete stored files', cleanupError));
    await prisma.apiIdempotencyKey
      .deleteMany({ where: ownReservation })
      .catch((cleanupError) =>
        console.error('api: failed to release idempotency key', cleanupError),
      );
    if (error instanceof ExternalUserDeletedError) return externalUserDeleted();
    if (error instanceof ReservationLostError) {
      return apiError(409, 'idempotency_conflict', 'This request took too long; retry it');
    }
    throw error;
  }

  pubsub.publish('taskChanged', task);
  await recordAuditEvent(prisma, {
    entityType: 'TASK',
    entityId: task.id,
    action: 'CREATED',
    actorType: 'SYSTEM',
    workspaceId,
    changes: [
      { field: 'apiKey', oldValue: null, newValue: `${apiKey.name} (…${apiKey.displayHint})` },
    ],
  });
  return taskResponse(201, task);
}
