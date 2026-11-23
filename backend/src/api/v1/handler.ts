import type { PrismaClient } from '@prisma/client';
import type { PubSubLike } from '../../context.js';
import { apiError } from './http.js';
import { handleCreateTask } from './tasks.js';
import { handlePurgeExternalTasks } from './external-tasks.js';

export const PUBLIC_API_PREFIX = '/api/v1/';

/** Largest request the public API accepts: 5 attachments of 10 MB plus the JSON. */
export const MAX_PUBLIC_API_BODY_BYTES = 52 * 1024 * 1024;

/**
 * The public API, for other services authenticated with an API key. It sends
 * no CORS headers: callers are servers, not browsers.
 */
export function createPublicApiHandler(deps: { prisma: PrismaClient; pubsub: PubSubLike }) {
  return async (request: Request, url: URL): Promise<Response> => {
    try {
      const route = url.pathname.slice(PUBLIC_API_PREFIX.length);

      if (route === 'tasks') {
        if (request.method !== 'POST') return apiError(405, 'method_not_allowed', 'Use POST');
        const length = request.headers.get('content-length');
        if (!length) return apiError(411, 'length_required', 'Content-Length is required');
        if (Number(length) > MAX_PUBLIC_API_BODY_BYTES) {
          return apiError(413, 'payload_too_large', 'The request is over 52 MiB');
        }
        return await handleCreateTask(request, deps);
      }

      if (route === 'external-tasks') {
        if (request.method !== 'DELETE') return apiError(405, 'method_not_allowed', 'Use DELETE');
        return await handlePurgeExternalTasks(request, url, deps.prisma);
      }

      return apiError(404, 'not_found', 'No such endpoint');
    } catch (error) {
      console.error('public api: unexpected error', error);
      return new Response(
        JSON.stringify({ error: { code: 'internal', message: 'Internal error; retry later' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  };
}
