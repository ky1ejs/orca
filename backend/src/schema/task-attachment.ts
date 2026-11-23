import { GraphQLError } from 'graphql';
import type {
  QueryResolvers,
  TaskAttachmentResolvers,
  TaskResolvers,
} from '../__generated__/graphql.js';
import { requireTaskAccess } from '../auth/workspace.js';
import { getAttachmentStorage } from '../attachments/storage.js';

/** Largest file `contentBase64` returns; bigger files are downloaded instead. */
export const MAX_INLINE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function notFound(): GraphQLError {
  return new GraphQLError('Attachment not found', { extensions: { code: 'NOT_FOUND' } });
}

export const taskAttachmentResolvers = {
  Query: {
    taskAttachment: async (_parent, args, context) => {
      const attachment = await context.prisma.taskAttachment.findUnique({
        where: { id: args.id },
      });
      if (!attachment) throw notFound();
      try {
        await requireTaskAccess(context.prisma, attachment.taskId, context.userId);
      } catch {
        // Same error as a missing attachment, so ids can't be probed.
        throw notFound();
      }
      return attachment;
    },
  } satisfies Pick<QueryResolvers, 'taskAttachment'>,
  Task: {
    attachments: (parent, _args, context) =>
      context.prisma.taskAttachment.findMany({
        where: { taskId: parent.id },
        orderBy: { createdAt: 'asc' },
      }),
  } satisfies Pick<TaskResolvers, 'attachments'>,
  TaskAttachment: {
    task: async (parent, _args, context) =>
      context.prisma.task.findUniqueOrThrow({ where: { id: parent.taskId } }),
    // Reached only through a task or taskAttachment the caller may read.
    contentBase64: async (parent) => {
      if (parent.byteSize > MAX_INLINE_ATTACHMENT_BYTES) {
        throw new GraphQLError(
          `Attachment is over ${MAX_INLINE_ATTACHMENT_BYTES / 1024 / 1024} MB; download it instead`,
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }
      const storage = getAttachmentStorage();
      if (!storage) {
        throw new GraphQLError('Attachment storage is not configured', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }
      const data = await storage.get(parent.storageKey);
      if (!data) throw notFound();
      return Buffer.from(data).toString('base64');
    },
  } satisfies Pick<TaskAttachmentResolvers, 'task' | 'contentBase64'>,
};
