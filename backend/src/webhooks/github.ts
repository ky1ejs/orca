import { prisma } from '../db/client.js';
import { pubsub } from '../pubsub.js';
import { verifyGitHubSignature } from './verify-signature.js';
import {
  handlePullRequestOpenedOrEdited,
  handlePullRequestClosed,
  handlePullRequestReopened,
  handleReviewSubmitted,
  handleInstallationCreated,
  handleInstallationDeleted,
  handleInstallationRepositoriesChanged,
} from './github-events.js';

export async function handleGitHubWebhook(request: Request): Promise<Response> {
  const signature = request.headers.get('x-hub-signature-256');
  const deliveryId = request.headers.get('x-github-delivery');
  const event = request.headers.get('x-github-event');

  if (!signature || !deliveryId || !event) {
    return new Response('Missing required headers', { status: 400 });
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET not configured');
    return new Response('Webhook not configured', { status: 500 });
  }

  const body = await request.arrayBuffer();
  const valid = await verifyGitHubSignature(body, signature, secret);
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  // Idempotency check
  const existing = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (existing) {
    return new Response('Already processed', { status: 200 });
  }

  const payload = JSON.parse(new TextDecoder().decode(body));
  const action = payload.action as string | undefined;
  const routeKey = action ? `${event}.${action}` : event;

  switch (routeKey) {
    case 'pull_request.opened':
    case 'pull_request.edited':
      await handlePullRequestOpenedOrEdited(payload, prisma, pubsub);
      break;
    case 'pull_request.closed':
      await handlePullRequestClosed(payload, prisma, pubsub);
      break;
    case 'pull_request.reopened':
      await handlePullRequestReopened(payload, prisma, pubsub);
      break;
    case 'pull_request_review.submitted':
      await handleReviewSubmitted(payload, prisma);
      break;
    case 'installation.created':
      await handleInstallationCreated(payload, prisma);
      break;
    case 'installation.deleted':
      await handleInstallationDeleted(payload, prisma);
      break;
    case 'installation_repositories.added':
    case 'installation_repositories.removed':
      await handleInstallationRepositoriesChanged(payload, prisma);
      break;
  }

  // Record delivery for idempotency
  await prisma.webhookDelivery.create({
    data: { id: deliveryId, event },
  });

  return new Response('OK', { status: 200 });
}
