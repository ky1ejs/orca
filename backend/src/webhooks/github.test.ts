import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

// Mock dependencies before importing
vi.mock('../db/client.js', () => ({
  prisma: {
    webhookDelivery: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../pubsub.js', () => ({
  pubsub: { publish: vi.fn(), subscribe: vi.fn() },
}));

vi.mock('./github-events.js', () => ({
  handlePullRequestOpenedOrEdited: vi.fn().mockResolvedValue(undefined),
  handlePullRequestClosed: vi.fn().mockResolvedValue(undefined),
  handlePullRequestReopened: vi.fn().mockResolvedValue(undefined),
  handleReviewSubmitted: vi.fn().mockResolvedValue(undefined),
  handleInstallationCreated: vi.fn().mockResolvedValue(undefined),
  handleInstallationDeleted: vi.fn().mockResolvedValue(undefined),
}));

import { handleGitHubWebhook } from './github.js';
import { prisma } from '../db/client.js';
import { handlePullRequestOpenedOrEdited } from './github-events.js';

const SECRET = 'test-webhook-secret';

function sign(body: string): string {
  const hmac = createHmac('sha256', SECRET).update(body).digest('hex');
  return `sha256=${hmac}`;
}

function createRequest(body: string, headers: Record<string, string> = {}): Request {
  const defaultHeaders: Record<string, string> = {
    'x-hub-signature-256': sign(body),
    'x-github-delivery': 'delivery-123',
    'x-github-event': 'pull_request',
    ...headers,
  };

  return new Request('http://localhost/webhooks/github', {
    method: 'POST',
    body,
    headers: defaultHeaders,
  });
}

describe('handleGitHubWebhook', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', SECRET);
    vi.clearAllMocks();
    (prisma.webhookDelivery.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('returns 400 for missing headers', async () => {
    const req = new Request('http://localhost/webhooks/github', {
      method: 'POST',
      body: '{}',
    });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    const req = createRequest('{}', {
      'x-hub-signature-256': 'sha256=invalid',
    });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 for duplicate delivery', async () => {
    (prisma.webhookDelivery.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'delivery-123',
    });
    const body = JSON.stringify({ action: 'opened' });
    const req = createRequest(body);
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(handlePullRequestOpenedOrEdited).not.toHaveBeenCalled();
  });

  it('routes pull_request.opened to handler', async () => {
    const body = JSON.stringify({ action: 'opened', pull_request: {} });
    const req = createRequest(body);
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(handlePullRequestOpenedOrEdited).toHaveBeenCalled();
  });

  it('returns 200 for unknown event', async () => {
    const body = JSON.stringify({ action: 'unknown' });
    const req = createRequest(body, { 'x-github-event': 'unknown_event' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
  });
});
