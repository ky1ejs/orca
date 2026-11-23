import { GraphQLError } from 'graphql';
import type { PrismaClient, TaskAttachment } from '@prisma/client';
import type {
  QueryResolvers,
  TaskAttachmentResolvers,
  TaskResolvers,
} from '../__generated__/graphql.js';
import { requireTaskAccess } from '../auth/workspace.js';
import { ATTACHMENT_MIME_TYPES, getAttachmentStorage } from '../attachments/storage.js';

/** Largest file `taskAttachmentContent` returns; bigger files are downloaded instead. */
export const MAX_INLINE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function notFound(): GraphQLError {
  return new GraphQLError('Attachment not found', { extensions: { code: 'NOT_FOUND' } });
}

function tooLarge(): GraphQLError {
  return new GraphQLError(
    `Attachment is over ${MAX_INLINE_ATTACHMENT_BYTES / 1024 / 1024} MB; download it instead`,
    { extensions: { code: 'BAD_USER_INPUT' } },
  );
}

/**
 * Loads an attachment the user may read. A missing attachment and one in a
 * workspace the user can't see give the same error, so ids can't be probed.
 */
async function requireAttachmentAccess(
  prisma: PrismaClient,
  attachmentId: string,
  userId: string,
): Promise<TaskAttachment> {
  const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw notFound();
  try {
    await requireTaskAccess(prisma, attachment.taskId, userId);
  } catch {
    throw notFound();
  }
  return attachment;
}

export const taskAttachmentResolvers = {
  Query: {
    taskAttachment: (_parent, args, context) =>
      requireAttachmentAccess(context.prisma, args.id, context.userId),

    // A top-level field, so one request reads at most one file: a list query
    // such as workspace { tasks { attachments } } can't reach the bytes.
    taskAttachmentContent: async (_parent, args, context) => {
      const attachment = await requireAttachmentAccess(context.prisma, args.id, context.userId);
      if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(attachment.mimeType)) {
        throw new GraphQLError('Only PNG and JPEG attachments can be returned here', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (attachment.byteSize > MAX_INLINE_ATTACHMENT_BYTES) throw tooLarge();

      const storage = getAttachmentStorage();
      if (!storage) {
        throw new GraphQLError('Attachment storage is not configured', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }
      const data = await storage.get(attachment.storageKey);
      if (!data) throw notFound();
      // The stored size is what was recorded on upload; check the real bytes too.
      if (data.byteLength > MAX_INLINE_ATTACHMENT_BYTES) throw tooLarge();
      return { attachment, contentBase64: Buffer.from(data).toString('base64') };
    },
  } satisfies Pick<QueryResolvers, 'taskAttachment' | 'taskAttachmentContent'>,
  Task: {
    attachments: (parent, _args, context) => context.loaders.attachmentsByTaskId.load(parent.id),
  } satisfies Pick<TaskResolvers, 'attachments'>,
  TaskAttachment: {
    task: (parent, _args, context) =>
      context.prisma.task.findUniqueOrThrow({ where: { id: parent.taskId } }),
  } satisfies Pick<TaskAttachmentResolvers, 'task'>,
};
