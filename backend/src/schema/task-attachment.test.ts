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

const { Query, Task } = taskAttachmentResolvers;

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

  it('batches a task’s attachments through the loader', async () => {
    const ctx = createMockContext();
    const load = vi.fn().mockResolvedValue([ATTACHMENT]);
    await Task.attachments({ id: 'task1' } as never, {}, {
      ...ctx,
      loaders: { attachmentsByTaskId: { load } },
    } as never);
    expect(load).toHaveBeenCalledWith('task1');
  });

  describe('Query.taskAttachmentContent', () => {
    function content(ctx = createMockContext()) {
      return Query.taskAttachmentContent({} as never, { id: 'att1' }, ctx as never);
    }

    it('returns the stored bytes as base64 with the attachment', async () => {
      setAttachmentStorage(fakeStorage(new Uint8Array([1, 2, 3, 4])));
      expect(await content()).toEqual({ attachment: ATTACHMENT, contentBase64: 'AQIDBA==' });
    });

    it('gives a non-member the same error as a missing attachment', async () => {
      setAttachmentStorage(fakeStorage(new Uint8Array([1])));
      await expect(content(createMockContext(false))).rejects.toThrow('Attachment not found');
    });

    it('refuses files recorded as over the limit without reading them', async () => {
      const storage = fakeStorage(new Uint8Array());
      setAttachmentStorage(storage);
      const ctx = createMockContext();
      ctx.prisma.taskAttachment.findUnique.mockResolvedValue({
        ...ATTACHMENT,
        byteSize: MAX_INLINE_ATTACHMENT_BYTES + 1,
      });
      await expect(content(ctx)).rejects.toThrow('over 5 MB');
      expect(storage.get).not.toHaveBeenCalled();
    });

    it('refuses stored bytes over the limit even when the record says less', async () => {
      setAttachmentStorage(fakeStorage(new Uint8Array(MAX_INLINE_ATTACHMENT_BYTES + 1)));
      await expect(content()).rejects.toThrow('over 5 MB');
    });

    it('refuses types that are not PNG or JPEG', async () => {
      setAttachmentStorage(fakeStorage(new Uint8Array([1])));
      const ctx = createMockContext();
      ctx.prisma.taskAttachment.findUnique.mockResolvedValue({
        ...ATTACHMENT,
        mimeType: 'application/pdf',
      });
      await expect(content(ctx)).rejects.toThrow('Only PNG and JPEG');
    });

    it('says when storage is not configured', async () => {
      await expect(content()).rejects.toThrow('not configured');
    });

    it('treats a missing object as not found', async () => {
      setAttachmentStorage(fakeStorage(null));
      await expect(content()).rejects.toThrow('Attachment not found');
    });
  });
});
