import { describe, expect, it, vi } from 'vitest';
import { createPublicApiHandler, MAX_PUBLIC_API_BODY_BYTES } from './handler.js';

const handler = createPublicApiHandler({
  prisma: { apiKey: { findUnique: vi.fn().mockResolvedValue(null) } } as never,
  pubsub: { publish: vi.fn() } as never,
});

function call(path: string, init: RequestInit = {}) {
  const request = new Request(`http://orca.test${path}`, init);
  return handler(request, new URL(request.url));
}

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('public API routing and request checks', () => {
  it('requires Content-Length on task intake', async () => {
    const res = await call('/api/v1/tasks', { method: 'POST' });
    expect(res.status).toBe(411);
  });

  it('refuses a body over the limit before reading it', async () => {
    const res = await call('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Length': String(MAX_PUBLIC_API_BODY_BYTES + 1) },
    });
    expect(res.status).toBe(413);
  });

  it('refuses an unknown key with 401', async () => {
    const res = await call('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Length': '2', Authorization: 'Bearer orca_unknown' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('unauthorized');
  });

  it('answers wrong methods and unknown paths', async () => {
    expect((await call('/api/v1/tasks')).status).toBe(405);
    expect((await call('/api/v1/external-tasks', { method: 'POST' })).status).toBe(405);
    expect((await call('/api/v1/nothing')).status).toBe(404);
  });

  it('sends no CORS headers', async () => {
    const res = await call('/api/v1/nothing');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
