import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_INLINE_ATTACHMENT_BYTES, taskAttachmentResolvers } from './task-attachment.js';
import { setAttachmentStorage, type AttachmentStorage } from '../attachments/storage.js';

const ATTACHMENT = {
  id: 'att1',
  taskId: 'task1',
  workspaceId: 'ws1',
  filename: 'screenshot-1.png',
  mimeType: 'image/png',
  byteSize: 4,
  storageKey: 'tasks/ws1/task1/att1',
  createdAt: new Date(),
};

function createMockContext(isMember = true) {
  const prisma = {
    taskAttachment: {
      findUnique: vi.fn().mockResolvedValue(ATTACHMENT),
      findMany: vi.fn().mockResolvedValue([ATTACHMENT]),
    },
    task: {
      findUnique: vi.fn().mockResolvedValue({ id: 'task1', workspaceId: 'ws1' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'task1' }),
    },
    workspace: { findUnique: vi.fn().mockResolvedValue({ deletedAt: null }) },
    workspaceMembership: {
      findUnique: vi.fn().mockResolvedValue(isMember ? { role: 'MEMBER' } : null),
    },
  };
  return { prisma, userId: 'user1' };
}

function fakeStorage(data: Uint8Array<ArrayBuffer> | null): AttachmentStorage {
  return {
    kind: 'filesystem',
    put: vi.fn(),
    get: vi.fn().mockResolvedValue(data),
    delete: vi.fn(),
  };
}

const { Query, Task, TaskAttachment } = taskAttachmentResolvers;

afterEach(() => setAttachmentStorage(null));

describe('task attachment resolvers', () => {
  describe('Query.taskAttachment', () => {
    it('returns the attachment to a workspace member', async () => {
      const ctx = createMockContext(true);
      expect(await Query.taskAttachment({} as never, { id: 'att1' }, ctx as never)).toBe(
        ATTACHMENT,
      );
    });

    it('gives a non-member the same error as a missing attachment', async () => {
      const outsider = createMockContext(false);
      const missing = createMockContext(true);
      missing.prisma.taskAttachment.findUnique.mockResolvedValue(null);

      for (const ctx of [outsider, missing]) {
        await expect(
          Query.taskAttachment({} as never, { id: 'att1' }, ctx as never),
        ).rejects.toMatchObject({
          message: 'Attachment not found',
          extensions: { code: 'NOT_FOUND' },
        });
      }
    });
  });

  it('lists a task’s attachments oldest first', async () => {
    const ctx = createMockContext();
    await Task.attachments({ id: 'task1' } as never, {}, ctx as never);
    expect(ctx.prisma.taskAttachment.findMany).toHaveBeenCalledWith({
      where: { taskId: 'task1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  describe('TaskAttachment.contentBase64', () => {
    it('returns the stored bytes as base64', async () => {
      setAttachmentStorage(fakeStorage(new Uint8Array([1, 2, 3, 4])));
      expect(await TaskAttachment.contentBase64(ATTACHMENT)).toBe('AQIDBA==');
    });

    it('refuses files over the inline limit without reading them', async () => {
      const storage = fakeStorage(new Uint8Array());
      setAttachmentStorage(storage);
      await expect(
        TaskAttachment.contentBase64({ ...ATTACHMENT, byteSize: MAX_INLINE_ATTACHMENT_BYTES + 1 }),
      ).rejects.toThrow('over 5 MB');
      expect(storage.get).not.toHaveBeenCalled();
    });

    it('says when storage is not configured', async () => {
      await expect(TaskAttachment.contentBase64(ATTACHMENT)).rejects.toThrow('not configured');
    });

    it('treats a missing object as not found', async () => {
      setAttachmentStorage(fakeStorage(null));
      await expect(TaskAttachment.contentBase64(ATTACHMENT)).rejects.toThrow(
        'Attachment not found',
      );
    });
  });
});
