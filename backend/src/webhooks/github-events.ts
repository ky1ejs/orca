import { PullRequestStatus, ReviewStatus, TaskStatus, type PrismaClient } from '@prisma/client';
import type { PubSubLike } from '../context.js';
import { extractDisplayIds } from './display-id-parser.js';
import { fetchCombinedCheckStatus, getInstallationAccessToken } from './github-api.js';
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
    head: { ref: string; sha: string };
    user: { login: string };
  };
  repository: { full_name: string };
  installation?: { id: number };
}

interface CheckEventPayload {
  action: string;
  check_run?: {
    head_sha: string;
    pull_requests: Array<{ number: number }>;
  };
  check_suite?: {
    head_sha: string;
    pull_requests: Array<{ number: number }>;
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

interface InstallationRepositoriesPayload {
  action: 'added' | 'removed';
  installation: { id: number };
  repositories_added: Array<{ full_name: string }>;
  repositories_removed: Array<{ full_name: string }>;
}

async function publishTaskChanged(
  prisma: PrismaClient,
  pubsub: PubSubLike,
  taskId: string,
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (task) {
    pubsub.publish('taskChanged', task);
  }
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

export async function getWorkspacesFromInstallation(
  prisma: PrismaClient,
  installationId: number,
  repositoryFullName: string,
) {
  const installations = await prisma.gitHubInstallation.findMany({
    where: { installationId },
    select: {
      workspaceId: true,
      observedRepositories: true,
      workspace: { select: { slug: true } },
    },
  });

  return installations
    .filter((inst) => inst.observedRepositories.includes(repositoryFullName))
    .map((inst) => ({ workspaceId: inst.workspaceId, slug: inst.workspace.slug }));
}

export async function handlePullRequestOpenedOrEdited(
  payload: PullRequestPayload,
  prisma: PrismaClient,
  pubsub: PubSubLike,
) {
  const installationId = payload.installation?.id;
  if (!installationId) return;

  const workspaces = await getWorkspacesFromInstallation(
    prisma,
    installationId,
    payload.repository.full_name,
  );
  if (workspaces.length === 0) return;

  const pr = payload.pull_request;

  for (const { workspaceId, slug } of workspaces) {
    const searchText = `${pr.title} ${pr.head.ref}`;
    const tasks = await resolveTasksByDisplayIds(prisma, workspaceId, slug, searchText);
    if (tasks.length === 0) continue;

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
          headSha: pr.head.sha,
          author: pr.user.login,
          draft: pr.draft,
          taskId: task.id,
          workspaceId,
        },
        update: {
          title: pr.title,
          headBranch: pr.head.ref,
          headSha: pr.head.sha,
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
      } else {
        pubsub.publish('taskChanged', task);
      }
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
          return;
        }
      }
    }
  }

  await publishTaskChanged(prisma, pubsub, prRecord.taskId);
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

  const task = await prisma.task.findUnique({ where: { id: prRecord.taskId } });
  if (!task) return;

  if (task.status === TaskStatus.DONE) {
    const settings = await getWorkspaceSettings(prisma, prRecord.workspaceId);
    if (settings.autoCloseOnMerge) {
      const updated = await prisma.task.update({
        where: { id: prRecord.taskId },
        data: { status: TaskStatus.IN_REVIEW },
      });
      pubsub.publish('taskChanged', updated);
      return;
    }
  }

  pubsub.publish('taskChanged', task);
}

export async function handleReviewSubmitted(
  payload: ReviewPayload,
  prisma: PrismaClient,
  pubsub: PubSubLike,
) {
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

    await publishTaskChanged(prisma, pubsub, prRecord.taskId);
  }
}

export async function handlePullRequestSynchronize(
  payload: PullRequestPayload,
  prisma: PrismaClient,
  pubsub: PubSubLike,
) {
  const pr = payload.pull_request;
  const prRecord = await prisma.pullRequest.findUnique({ where: { githubId: pr.id } });
  if (!prRecord) return;

  await prisma.pullRequest.update({
    where: { githubId: pr.id },
    data: { headSha: pr.head.sha, checkStatus: null },
  });

  await publishTaskChanged(prisma, pubsub, prRecord.taskId);
}

export async function handleCheckEvent(
  payload: CheckEventPayload,
  prisma: PrismaClient,
  pubsub: PubSubLike,
) {
  const installationId = payload.installation?.id;
  if (!installationId) return;

  const inner = payload.check_run ?? payload.check_suite;
  if (!inner) return;

  let token: string | undefined;
  try {
    token = await getInstallationAccessToken(installationId);
  } catch {
    // Fall back to unauthenticated access
  }

  const repository = payload.repository.full_name;
  const prNumbers = inner.pull_requests.map((p) => p.number);
  const prSelect = { id: true, repository: true, headSha: true, taskId: true } as const;

  let prs = await prisma.pullRequest.findMany({
    where: { repository, number: { in: prNumbers } },
    select: prSelect,
  });

  // Fallback: match by headSha
  if (prs.length === 0) {
    prs = await prisma.pullRequest.findMany({
      where: { repository, headSha: inner.head_sha },
      select: prSelect,
    });
  }

  if (prs.length === 0) return;

  // Fetch check status for all PRs in parallel
  const prsWithSha = prs.filter((pr) => pr.headSha);
  const results = await Promise.all(
    prsWithSha.map(async (pr) => {
      const [owner, repo] = pr.repository.split('/');
      const checkStatus = await fetchCombinedCheckStatus(owner, repo, pr.headSha!, token);
      return { id: pr.id, taskId: pr.taskId, checkStatus };
    }),
  );

  await Promise.all(
    results.map((r) =>
      prisma.pullRequest.update({ where: { id: r.id }, data: { checkStatus: r.checkStatus } }),
    ),
  );

  const taskIds = new Set(results.map((r) => r.taskId));
  for (const taskId of taskIds) {
    await publishTaskChanged(prisma, pubsub, taskId);
  }
}

export async function handleInstallationCreated(
  payload: InstallationPayload,
  prisma: PrismaClient,
) {
  const repos = payload.repositories?.map((r) => r.full_name) ?? [];

  await prisma.gitHubInstallation.updateMany({
    where: { installationId: payload.installation.id },
    data: {
      accountLogin: payload.installation.account.login,
      accountType: payload.installation.account.type,
      repositories: repos,
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

export async function handleInstallationRepositoriesChanged(
  payload: InstallationRepositoriesPayload,
  prisma: PrismaClient,
) {
  const installations = await prisma.gitHubInstallation.findMany({
    where: { installationId: payload.installation.id },
  });

  for (const installation of installations) {
    let repos = [...installation.repositories];
    let observed = [...installation.observedRepositories];

    if (payload.action === 'added') {
      const newRepos = payload.repositories_added.map((r) => r.full_name);
      repos = [...new Set([...repos, ...newRepos])];
    } else if (payload.action === 'removed') {
      const removedRepos = new Set(payload.repositories_removed.map((r) => r.full_name));
      repos = repos.filter((r) => !removedRepos.has(r));
      observed = observed.filter((r) => !removedRepos.has(r));
    }

    await prisma.gitHubInstallation.update({
      where: { id: installation.id },
      data: { repositories: repos, observedRepositories: observed },
    });
  }
}
