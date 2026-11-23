import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attachmentStorageFromEnv,
  attachmentStorageKey,
  createFilesystemStorage,
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
    const key = attachmentStorageKey('ws1', 'task1', 'att1');
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

  it('names the missing variables when BUCKET_NAME is set without them', () => {
    expect(() => attachmentStorageFromEnv({ BUCKET_NAME: 'b', AWS_ACCESS_KEY_ID: 'id' })).toThrow(
      'AWS_ENDPOINT_URL_S3, AWS_SECRET_ACCESS_KEY is missing',
    );
  });
});
