import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAttachmentHandler } from './route.js';
import { setAttachmentStorage, type AttachmentStorage } from './storage.js';
import { signJwt } from '../auth/jwt.js';

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

function mockPrisma(attachment: typeof ATTACHMENT = ATTACHMENT) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'user1' }) },
    taskAttachment: { findUnique: vi.fn().mockResolvedValue(attachment) },
    task: { findUnique: vi.fn().mockResolvedValue({ id: 'task1', workspaceId: 'ws1' }) },
    workspace: { findUnique: vi.fn().mockResolvedValue({ deletedAt: null }) },
    workspaceMembership: { findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER' }) },
  };
}

function storageWith(get: AttachmentStorage['get']): AttachmentStorage {
  return { kind: 'filesystem', put: vi.fn(), delete: vi.fn(), get };
}

let token: string;

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'route-test-secret';
  token = await signJwt({ sub: 'user1', email: 'user1@orca.local' });
});

afterEach(() => setAttachmentStorage(null));

async function download(prisma = mockPrisma()) {
  const handler = createAttachmentHandler(prisma as never);
  return handler(
    new Request('http://orca.test/attachments/att1', {
      headers: { Authorization: `Bearer ${token}` },
    }),
    '/attachments/att1',
  );
}

describe('GET /attachments/:id', () => {
  it('serves the file uncached, with CORS and nosniff', async () => {
    setAttachmentStorage(storageWith(async () => new Uint8Array([1, 2, 3, 4])));
    const res = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers a storage failure with 502 and the CORS headers', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAttachmentStorage(
      storageWith(() =>
        Promise.reject(Object.assign(new Error('denied'), { code: 'AccessDenied' })),
      ),
    );
    const res = await download();
    expect(res.status).toBe(502);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    error.mockRestore();
  });

  it('refuses an oversized record without reading it', async () => {
    const get = vi.fn();
    setAttachmentStorage(storageWith(get));
    const res = await download(mockPrisma({ ...ATTACHMENT, byteSize: 50 * 1024 * 1024 }));
    expect(res.status).toBe(413);
    expect(get).not.toHaveBeenCalled();
  });

  it('downloads a non-image type instead of rendering it', async () => {
    setAttachmentStorage(storageWith(async () => new Uint8Array([1])));
    const res = await download(mockPrisma({ ...ATTACHMENT, mimeType: 'text/html' }));
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
  });
});
