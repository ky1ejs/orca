import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Where task attachment bytes live. Production uses the Tigris bucket that
 * `fly storage create` attaches to the app; development and tests use a
 * local folder.
 */
export interface AttachmentStorage {
  readonly kind: 's3' | 'filesystem';
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes, or null if there is no object at `key`. */
  get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;
  /** Deletes each key. A key with no object is not an error. */
  delete(keys: string[]): Promise<void>;
}

/** Image types Orca stores and serves. Anything else is refused on upload. */
export const ATTACHMENT_MIME_TYPES = ['image/png', 'image/jpeg'] as const;

export function attachmentStorageKey(
  workspaceId: string,
  taskId: string,
  attachmentId: string,
): string {
  return `tasks/${workspaceId}/${taskId}/${attachmentId}`;
}

export function createFilesystemStorage(directory: string): AttachmentStorage {
  const root = resolve(directory);
  // Keys are server-built, but a key must never reach outside the folder.
  const pathFor = (key: string) => {
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) throw new Error(`Invalid attachment key: ${key}`);
    return path;
  };

  return {
    kind: 'filesystem',
    async put(key, data) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async delete(keys) {
      await Promise.all(keys.map((key) => rm(pathFor(key), { force: true })));
    },
  };
}

/** The part of Bun's S3 client this module uses, so tests can stub it. */
interface S3ClientLike {
  write(key: string, data: Uint8Array, options: { type: string }): Promise<unknown>;
  file(key: string): { arrayBuffer(): Promise<ArrayBuffer> };
  delete(key: string): Promise<unknown>;
}

/** Bun reports a missing object as an S3Error whose code is the S3 error code. */
function isMissingObjectError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'NoSuchKey' || code === 'NotFound';
}

export function createS3Storage(client: S3ClientLike): AttachmentStorage {
  return {
    kind: 's3',
    async put(key, data, contentType) {
      await client.write(key, data, { type: contentType });
    },
    async get(key) {
      // One request: a missing object comes back as an error, rather than
      // checking exists() first, which would race with a delete.
      try {
        return new Uint8Array(await client.file(key).arrayBuffer());
      } catch (error) {
        if (isMissingObjectError(error)) return null;
        throw error;
      }
    },
    async delete(keys) {
      await Promise.all(keys.map((key) => client.delete(key)));
    },
  };
}

/**
 * Picks storage from the environment:
 * - `BUCKET_NAME` with the `AWS_*` variables `fly storage create` sets: S3.
 * - `ATTACHMENT_STORAGE_DIR`: a local folder.
 * - Neither, or `BUCKET_NAME` with a missing `AWS_*` variable: null.
 *   Attachments are then unavailable, and the server logs why at startup rather
 *   than failing, so it still runs before a bucket exists.
 */
export function attachmentStorageFromEnv(
  env: Record<string, string | undefined> = process.env,
): AttachmentStorage | null {
  const bucket = env.BUCKET_NAME;
  if (bucket) {
    const missing = ['AWS_ENDPOINT_URL_S3', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter(
      (name) => !env[name],
    );
    if (missing.length > 0) {
      // Half-configured storage disables attachments, not the whole server.
      console.error(
        `Attachment storage disabled: BUCKET_NAME is set but ${missing.join(', ')} is missing`,
      );
      return null;
    }
    // Bun's built-in client; this branch only runs on the Bun server.
    return createS3Storage(
      new Bun.S3Client({
        bucket,
        endpoint: env.AWS_ENDPOINT_URL_S3,
        region: env.AWS_REGION || 'auto',
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      }),
    );
  }
  if (env.ATTACHMENT_STORAGE_DIR) {
    return createFilesystemStorage(join(env.ATTACHMENT_STORAGE_DIR));
  }
  return null;
}

let configuredStorage: AttachmentStorage | null = null;

export function setAttachmentStorage(storage: AttachmentStorage | null): void {
  configuredStorage = storage;
}

export function getAttachmentStorage(): AttachmentStorage | null {
  return configuredStorage;
}
