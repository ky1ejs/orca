import { TaskPriority } from '@prisma/client';
import { z } from 'zod';

export const MAX_ATTACHMENTS_PER_TASK = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const FILE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

/** The JSON in the request's `task` part. */
export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(50_000).nullish(),
    priority: z.nativeEnum(TaskPriority).optional(),
    projectId: z.string().min(1).nullish(),
    labelIds: z.array(z.string().min(1)).max(20).optional(),
    externalUserRef: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/, 'Use 1-128 letters, digits, "-" or "_"')
      .nullish(),
  })
  .strict();

export interface ValidatedAttachment {
  data: Uint8Array;
  mimeType: string;
  /** Orca's own name; the uploader's filename is never stored. */
  filename: string;
}

function startsWith(data: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => data[i] === byte);
}

/**
 * Checks an uploaded file: a PNG or JPEG, declared and by its first bytes,
 * from 1 byte to 10 MB. Returns an error message for anything else.
 */
export async function validateAttachment(
  file: File,
  index: number,
): Promise<ValidatedAttachment | string> {
  const mimeType = file.type.split(';')[0].trim().toLowerCase();
  const extension = FILE_EXTENSIONS[mimeType];
  if (!extension) return `Attachment ${index + 1} must be image/png or image/jpeg`;
  if (file.size === 0) return `Attachment ${index + 1} is empty`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `Attachment ${index + 1} is over 10 MB`;

  const data = new Uint8Array(await file.arrayBuffer());
  const signature = mimeType === 'image/png' ? PNG_SIGNATURE : JPEG_SIGNATURE;
  if (!startsWith(data, signature)) {
    return `Attachment ${index + 1} is not a valid ${extension.toUpperCase()} file`;
  }
  return { data, mimeType, filename: `attachment-${index + 1}.${extension}` };
}

/** Idempotency keys are 1-100 printable ASCII characters. */
export function isValidIdempotencyKey(key: string | null): key is string {
  return key !== null && /^[\x21-\x7e]{1,100}$/.test(key);
}
