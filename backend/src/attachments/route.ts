import type { PrismaClient } from '@prisma/client';
import { verifyJwt } from '../auth/jwt.js';
import { requireTaskAccess } from '../auth/workspace.js';
import { ATTACHMENT_MIME_TYPES, getAttachmentStorage } from './storage.js';

export const ATTACHMENT_PATH_PREFIX = '/attachments/';

/**
 * Largest file this route reads. Uploads are capped below this, so only a bad
 * record reaches it; the cap keeps one request from buffering an unbounded file.
 */
const MAX_SERVED_ATTACHMENT_BYTES = 12 * 1024 * 1024;

// The desktop app's renderer calls this from another origin with a bearer
// token. No cookies are involved, so any origin may call it: the token is the
// only credential.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function authenticatedUserId(request: Request, prisma: PrismaClient): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const { sub } = await verifyJwt(header.slice('Bearer '.length));
    if (!sub) return null;
    const user = await prisma.user.findUnique({ where: { id: sub }, select: { id: true } });
    return user ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Serves `GET /attachments/:id` to members of the attachment's workspace,
 * authenticated with a session JWT. API keys and OAuth tokens are refused.
 * A missing attachment and one in a workspace the caller can't see both get
 * 404.
 */
export function createAttachmentHandler(prisma: PrismaClient) {
  return async (request: Request, pathname: string): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') return textResponse(405, 'Method not allowed');

    const userId = await authenticatedUserId(request, prisma);
    if (!userId) return textResponse(401, 'Missing or invalid authentication');

    const id = pathname.slice(ATTACHMENT_PATH_PREFIX.length);
    const attachment = id ? await prisma.taskAttachment.findUnique({ where: { id } }) : null;
    if (!attachment) return textResponse(404, 'Attachment not found');
    try {
      await requireTaskAccess(prisma, attachment.taskId, userId);
    } catch {
      return textResponse(404, 'Attachment not found');
    }

    const storage = getAttachmentStorage();
    if (!storage) return textResponse(503, 'Attachment storage is not configured');
    if (attachment.byteSize > MAX_SERVED_ATTACHMENT_BYTES) {
      return textResponse(413, 'Attachment is too large to serve');
    }
    // A storage failure gets a response from here, with the CORS headers, rather
    // than Bun's default 500, which the renderer would see as a network error.
    let data: Uint8Array<ArrayBuffer> | null;
    try {
      data = await storage.get(attachment.storageKey);
    } catch (error) {
      console.error(`attachment ${attachment.id}: storage read failed`, error);
      return textResponse(502, 'Attachment storage error');
    }
    if (!data) {
      console.error(`attachment ${attachment.id}: no object at its storage key`);
      return textResponse(404, 'Attachment not found');
    }

    // Serve only the image types Orca accepts; anything else downloads.
    const isServableImage = (ATTACHMENT_MIME_TYPES as readonly string[]).includes(
      attachment.mimeType,
    );
    const filename = attachment.filename.replace(/[^\w.-]/g, '_');
    return new Response(data, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': isServableImage ? attachment.mimeType : 'application/octet-stream',
        'Content-Length': String(data.byteLength),
        'Content-Disposition': `${isServableImage ? 'inline' : 'attachment'}; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
        // Never cached: access can be revoked, and these may hold personal data.
        'Cache-Control': 'private, no-store',
      },
    });
  };
}
