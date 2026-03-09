import { PullRequestStatus, ReviewStatus, TaskStatus, type PrismaClient } from '@prisma/client';
import type { PubSubLike } from '../context.js';
import { extractDisplayIds } from './display-id-parser.js';
import { getWorkspaceSettings } from './workspace-settings.js';

interface PullRequestPayload {
  action: string;
  pull_request: {
    id: number;
    number: number;
    title: string;
    html_url: string;
    state: string;
    merged: boolean;
    draft: boolean;
    head: { ref: string };
    user: { login: string };
  };
  repository: { full_name: string };
  installation?: { id: number };
}

interface ReviewPayload {
  action: string;
  review: { state: string };
  pull_request: { id: number };
  installation?: { id: number };
}

interface InstallationPayload {
  action: string;
  installation: {
    id: number;
    account: { login: string; type: string };
  };
  repositories?: Array<{ full_name: string }>;
}

async function resolveTasksByDisplayIds(
  prisma: PrismaClient,
  workspaceId: string,
  slug: string,
  text: string,
) {
  const ids = extractDisplayIds(text);
  if (ids.length === 0) return [];

  const upperSlug = slug.toUpperCase();
  const matchingIds = ids.filter((id) => id.slug === upperSlug);
  if (matchingIds.length === 0) return [];

  const displayIds = matchingIds.map((id) => `${id.slug}-${id.number}`);
  return prisma.task.findMany({
    where: { displayId: { in: displayIds }, workspaceId },
  });
}

async function getWorkspaceFromInstallation(prisma: PrismaClient, installationId: number) {
  const installation = await prisma.gitHubInstallation.findUnique({
    where: { installationId },
    select: { workspaceId: true, workspace: { select: { slug: true } } },
  });
  if (!installation) return null;
  return { workspaceId: installation.workspaceId, slug: installation.workspace.slug };
}

export async function handlePullRequestOpenedOrEdited(
  payload: PullRequestPayload,
  prisma: PrismaClient,
  pubsub: PubSubLike,
) {
  const installationId = payload.installation?.id;
  if (!installationId) return;

  const result = await getWorkspaceFromInstallation(prisma, installationId);
  if (!result) return;
  const { workspaceId, slug } = result;

  const pr = payload.pull_request;
  const searchText = `${pr.title} ${pr.head.ref}`;
  const tasks = await resolveTasksByDisplayIds(prisma, workspaceId, slug, searchText);
  if (tasks.length === 0) return;

  const settings = await getWorkspaceSettings(prisma, workspaceId);

  for (const task of tasks) {
    await prisma.pullRequest.upsert({
      where: { githubId: pr.id },
      create: {
        githubId: pr.id,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        status: PullRequestStatus.OPEN,
        repository: payload.repository.full_name,
        headBranch: pr.head.ref,
        author: pr.user.login,
        draft: pr.draft,
        taskId: task.id,
        workspaceId,
      },
      update: {
        title: pr.title,
        headBranch: pr.head.ref,
        draft: pr.draft,
        taskId: task.id,
      },
    });

    if (
      settings.autoInReviewOnPrOpen &&
      !pr.draft &&
      task.status !== TaskStatus.IN_REVIEW &&
      task.status !== TaskStatus.DONE
    ) {
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.IN_REVIEW },
      });
      pubsub.publish('taskChanged', updated);
    }
  }
}

export async function handlePullRequestClosed(
  payload: PullRequestPayload,
  prisma: PrismaClient,
  pubsub: PubSubLike,
) {
  const pr = payload.pull_request;
  const prRecord = await prisma.pullRequest.findUnique({ where: { githubId: pr.id } });
  if (!prRecord) return;

  const newStatus = pr.merged ? PullRequestStatus.MERGED : PullRequestStatus.CLOSED;
  await prisma.pullRequest.update({
    where: { githubId: pr.id },
    data: { status: newStatus },
  });

  if (pr.merged) {
    const settings = await getWorkspaceSettings(prisma, prRecord.workspaceId);
    if (settings.autoCloseOnMerge) {
      const openPrs = await prisma.pullRequest.count({
        where: { taskId: prRecord.taskId, status: PullRequestStatus.OPEN },
      });
      if (openPrs === 0) {
        const task = await prisma.task.findUnique({ where: { id: prRecord.taskId } });
        if (task && task.status !== TaskStatus.DONE) {
          const updated = await prisma.task.update({
            where: { id: prRecord.taskId },
            data: { status: TaskStatus.DONE },
          });
          pubsub.publish('taskChanged', updated);
        }
      }
    }
  }
}

export async function handlePullRequestReopened(
  payload: PullRequestPayload,
  prisma: PrismaClient,
  pubsub: PubSubLike,
) {
  const pr = payload.pull_request;
  const prRecord = await prisma.pullRequest.findUnique({ where: { githubId: pr.id } });
  if (!prRecord) return;

  await prisma.pullRequest.update({
    where: { githubId: pr.id },
    data: { status: PullRequestStatus.OPEN },
  });

  const settings = await getWorkspaceSettings(prisma, prRecord.workspaceId);
  if (settings.autoCloseOnMerge) {
    const task = await prisma.task.findUnique({ where: { id: prRecord.taskId } });
    if (task && task.status === TaskStatus.DONE) {
      const updated = await prisma.task.update({
        where: { id: prRecord.taskId },
        data: { status: TaskStatus.IN_REVIEW },
      });
      pubsub.publish('taskChanged', updated);
    }
  }
}

export async function handleReviewSubmitted(payload: ReviewPayload, prisma: PrismaClient) {
  const prRecord = await prisma.pullRequest.findUnique({
    where: { githubId: payload.pull_request.id },
  });
  if (!prRecord) return;

  const reviewState = payload.review.state.toUpperCase();
  const statusMap: Record<string, ReviewStatus> = {
    APPROVED: ReviewStatus.APPROVED,
    CHANGES_REQUESTED: ReviewStatus.CHANGES_REQUESTED,
    COMMENTED: ReviewStatus.COMMENTED,
  };

  const reviewStatus = statusMap[reviewState];
  if (reviewStatus) {
    await prisma.pullRequest.update({
      where: { githubId: payload.pull_request.id },
      data: { reviewStatus },
    });
  }
}

export async function handleInstallationCreated(
  payload: InstallationPayload,
  prisma: PrismaClient,
) {
  // Installation creation requires a workspace ID mapping.
  // This is handled by the "completeGitHubInstallation" mutation (deferred to follow-up).
  // For now, if we receive this event and the installation already exists, update it.
  const existing = await prisma.gitHubInstallation.findUnique({
    where: { installationId: payload.installation.id },
  });
  if (!existing) return;

  await prisma.gitHubInstallation.update({
    where: { installationId: payload.installation.id },
    data: {
      accountLogin: payload.installation.account.login,
      accountType: payload.installation.account.type,
      repositories: payload.repositories?.map((r) => r.full_name) ?? [],
    },
  });
}

export async function handleInstallationDeleted(
  payload: InstallationPayload,
  prisma: PrismaClient,
) {
  await prisma.gitHubInstallation.deleteMany({
    where: { installationId: payload.installation.id },
  });
}
