import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attachmentStorageFromEnv,
  attachmentStorageKey,
  createFilesystemStorage,
  createS3Storage,
} from './storage.js';

const directories: string[] = [];

async function tempStorage() {
  const directory = await mkdtemp(join(tmpdir(), 'orca-attachments-'));
  directories.push(directory);
  return createFilesystemStorage(directory);
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('filesystem attachment storage', () => {
  it('stores, reads and deletes bytes', async () => {
    const storage = await tempStorage();
    const key = attachmentStorageKey('ws1', 'att1');
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    await storage.put(key, bytes, 'image/png');
    expect(await storage.get(key)).toEqual(bytes);

    await storage.delete([key]);
    expect(await storage.get(key)).toBeNull();
  });

  it('returns null for a missing key and ignores deleting one', async () => {
    const storage = await tempStorage();
    expect(await storage.get('tasks/none')).toBeNull();
    await expect(storage.delete(['tasks/none'])).resolves.toBeUndefined();
  });

  it('refuses a key that leaves its folder', async () => {
    const storage = await tempStorage();
    await expect(storage.get('../outside')).rejects.toThrow('Invalid attachment key');
    await expect(storage.put('/etc/passwd', new Uint8Array(), 'image/png')).rejects.toThrow(
      'Invalid attachment key',
    );
  });
});

describe('attachmentStorageFromEnv', () => {
  it('is null when nothing is configured', () => {
    expect(attachmentStorageFromEnv({})).toBeNull();
  });

  it('uses a folder when ATTACHMENT_STORAGE_DIR is set', () => {
    expect(attachmentStorageFromEnv({ ATTACHMENT_STORAGE_DIR: tmpdir() })?.kind).toBe('filesystem');
  });

  it('disables storage, naming the missing variables, when BUCKET_NAME is set without them', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(attachmentStorageFromEnv({ BUCKET_NAME: 'b', AWS_ACCESS_KEY_ID: 'id' })).toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('AWS_ENDPOINT_URL_S3, AWS_SECRET_ACCESS_KEY is missing'),
    );
    error.mockRestore();
  });
});

describe('S3 attachment storage', () => {
  function stubClient(arrayBuffer: () => Promise<ArrayBuffer>) {
    return {
      write: vi.fn().mockResolvedValue(undefined),
      file: vi.fn(() => ({ arrayBuffer })),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('reads an object in one request', async () => {
    const client = stubClient(async () => new Uint8Array([7, 8]).buffer);
    expect(await createS3Storage(client).get('k')).toEqual(new Uint8Array([7, 8]));
    expect(client.file).toHaveBeenCalledTimes(1);
  });

  it('returns null for a missing object', async () => {
    const missing = Object.assign(new Error('missing'), { name: 'S3Error', code: 'NoSuchKey' });
    const client = stubClient(() => Promise.reject(missing));
    expect(await createS3Storage(client).get('k')).toBeNull();
  });

  it('rethrows other storage errors', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'S3Error', code: 'AccessDenied' });
    const client = stubClient(() => Promise.reject(denied));
    await expect(createS3Storage(client).get('k')).rejects.toThrow('denied');
  });

  it('writes with the content type and deletes each key', async () => {
    const client = stubClient(async () => new ArrayBuffer(0));
    const storage = createS3Storage(client);
    await storage.put('k', new Uint8Array([1]), 'image/png');
    await storage.delete(['a', 'b']);
    expect(client.write).toHaveBeenCalledWith('k', new Uint8Array([1]), { type: 'image/png' });
    expect(client.delete).toHaveBeenCalledTimes(2);
  });
});
