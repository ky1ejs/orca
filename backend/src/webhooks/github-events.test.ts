import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handlePullRequestOpenedOrEdited,
  handlePullRequestClosed,
  handlePullRequestReopened,
  handleReviewSubmitted,
  handleInstallationRepositoriesChanged,
  getWorkspacesFromInstallation,
} from './github-events.js';

// Mock prisma
function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    gitHubInstallation: {
      findMany: vi.fn().mockResolvedValue([
        {
          workspaceId: 'ws-1',
          observedRepositories: ['org/repo'],
          workspace: { slug: 'orca' },
        },
      ]),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([{ id: 'task-1', status: 'IN_PROGRESS' }]),
      findUnique: vi.fn().mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' }),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
    },
    pullRequest: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi
        .fn()
        .mockResolvedValue({ taskId: 'task-1', workspaceId: 'ws-1', status: 'OPEN' }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    workspaceSettings: {
      findUnique: vi.fn().mockResolvedValue({
        autoCloseOnMerge: true,
        autoInReviewOnPrOpen: false,
      }),
      upsert: vi.fn().mockResolvedValue({
        autoCloseOnMerge: true,
        autoInReviewOnPrOpen: false,
      }),
    },
    ...overrides,
  } as unknown as Parameters<typeof handlePullRequestOpenedOrEdited>[1];
}

function createMockPubsub() {
  return { publish: vi.fn(), subscribe: vi.fn() };
}

function createPrPayload(overrides: Record<string, unknown> = {}) {
  const { pull_request: prOverrides, ...rest } = overrides;
  return {
    action: 'opened',
    pull_request: {
      id: 100,
      number: 1,
      title: 'ORCA-42 Add feature',
      html_url: 'https://github.com/org/repo/pull/1',
      state: 'open',
      merged: false,
      draft: false,
      head: { ref: 'feat/ORCA-42-add-feature' },
      user: { login: 'testuser' },
      ...((prOverrides as object) ?? {}),
    },
    repository: { full_name: 'org/repo' },
    installation: { id: 123 },
    ...rest,
  };
}

describe('getWorkspacesFromInstallation', () => {
  it('returns workspaces that observe the repo', async () => {
    const prisma = createMockPrisma();
    const result = await getWorkspacesFromInstallation(prisma, 123, 'org/repo');
    expect(result).toEqual([{ workspaceId: 'ws-1', slug: 'orca' }]);
  });

  it('filters out workspaces that do not observe the repo', async () => {
    const prisma = createMockPrisma();
    const result = await getWorkspacesFromInstallation(prisma, 123, 'org/other-repo');
    expect(result).toEqual([]);
  });

  it('returns multiple workspaces when both observe the repo', async () => {
    const prisma = createMockPrisma({
      gitHubInstallation: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: 'ws-1',
            observedRepositories: ['org/repo'],
            workspace: { slug: 'orca' },
          },
          {
            workspaceId: 'ws-2',
            observedRepositories: ['org/repo', 'org/other'],
            workspace: { slug: 'acme' },
          },
        ]),
      },
    });
    const result = await getWorkspacesFromInstallation(prisma, 123, 'org/repo');
    expect(result).toEqual([
      { workspaceId: 'ws-1', slug: 'orca' },
      { workspaceId: 'ws-2', slug: 'acme' },
    ]);
  });
});

describe('handlePullRequestOpenedOrEdited', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let pubsub: ReturnType<typeof createMockPubsub>;

  beforeEach(() => {
    prisma = createMockPrisma();
    pubsub = createMockPubsub();
  });

  it('creates PR record and links to task', async () => {
    await handlePullRequestOpenedOrEdited(
      createPrPayload() as Parameters<typeof handlePullRequestOpenedOrEdited>[0],
      prisma,
      pubsub,
    );

    expect(prisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { githubId: 100 },
        create: expect.objectContaining({
          taskId: 'task-1',
          title: 'ORCA-42 Add feature',
        }),
      }),
    );
  });

  it('skips when no installation', async () => {
    await handlePullRequestOpenedOrEdited(
      createPrPayload({ installation: undefined }) as Parameters<
        typeof handlePullRequestOpenedOrEdited
      >[0],
      prisma,
      pubsub,
    );
    expect(prisma.pullRequest.upsert).not.toHaveBeenCalled();
  });

  it('skips when repo is not observed', async () => {
    prisma = createMockPrisma({
      gitHubInstallation: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: 'ws-1',
            observedRepositories: ['org/other-repo'],
            workspace: { slug: 'orca' },
          },
        ]),
      },
    });

    await handlePullRequestOpenedOrEdited(
      createPrPayload() as Parameters<typeof handlePullRequestOpenedOrEdited>[0],
      prisma,
      pubsub,
    );

    expect(prisma.pullRequest.upsert).not.toHaveBeenCalled();
  });

  it('auto-transitions to IN_REVIEW when enabled and not draft', async () => {
    const autoReviewSettings = {
      autoCloseOnMerge: true,
      autoInReviewOnPrOpen: true,
    };
    prisma.workspaceSettings.findUnique = vi.fn().mockResolvedValue(autoReviewSettings);
    prisma.workspaceSettings.upsert = vi.fn().mockResolvedValue(autoReviewSettings);

    await handlePullRequestOpenedOrEdited(
      createPrPayload() as Parameters<typeof handlePullRequestOpenedOrEdited>[0],
      prisma,
      pubsub,
    );

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'IN_REVIEW' },
      }),
    );
    expect(pubsub.publish).toHaveBeenCalledWith('taskChanged', expect.anything());
  });

  it('does not auto-transition for draft PRs', async () => {
    const autoReviewSettings = {
      autoCloseOnMerge: true,
      autoInReviewOnPrOpen: true,
    };
    prisma.workspaceSettings.findUnique = vi.fn().mockResolvedValue(autoReviewSettings);
    prisma.workspaceSettings.upsert = vi.fn().mockResolvedValue(autoReviewSettings);

    await handlePullRequestOpenedOrEdited(
      createPrPayload({
        pull_request: { draft: true },
      }) as Parameters<typeof handlePullRequestOpenedOrEdited>[0],
      prisma,
      pubsub,
    );

    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe('handlePullRequestClosed', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let pubsub: ReturnType<typeof createMockPubsub>;

  beforeEach(() => {
    prisma = createMockPrisma();
    pubsub = createMockPubsub();
  });

  it('sets status to MERGED when merged and auto-closes task', async () => {
    await handlePullRequestClosed(
      createPrPayload({
        action: 'closed',
        pull_request: { merged: true },
      }) as Parameters<typeof handlePullRequestClosed>[0],
      prisma,
      pubsub,
    );

    expect(prisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'MERGED' } }),
    );
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DONE' } }),
    );
  });

  it('sets status to CLOSED when not merged and does not auto-close', async () => {
    await handlePullRequestClosed(
      createPrPayload({
        action: 'closed',
        pull_request: { merged: false },
      }) as Parameters<typeof handlePullRequestClosed>[0],
      prisma,
      pubsub,
    );

    expect(prisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CLOSED' } }),
    );
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('does not auto-close when other PRs are still open', async () => {
    prisma.pullRequest.count = vi.fn().mockResolvedValue(1);

    await handlePullRequestClosed(
      createPrPayload({
        action: 'closed',
        pull_request: { merged: true },
      }) as Parameters<typeof handlePullRequestClosed>[0],
      prisma,
      pubsub,
    );

    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe('handlePullRequestReopened', () => {
  it('sets PR to OPEN and reverts DONE task to IN_REVIEW', async () => {
    const prisma = createMockPrisma();
    const pubsub = createMockPubsub();
    prisma.task.findUnique = vi.fn().mockResolvedValue({ id: 'task-1', status: 'DONE' });

    await handlePullRequestReopened(
      createPrPayload({ action: 'reopened' }) as Parameters<typeof handlePullRequestReopened>[0],
      prisma,
      pubsub,
    );

    expect(prisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OPEN' } }),
    );
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'IN_REVIEW' } }),
    );
  });
});

describe('handleReviewSubmitted', () => {
  it('updates review status', async () => {
    const prisma = createMockPrisma();

    await handleReviewSubmitted(
      {
        action: 'submitted',
        review: { state: 'approved' },
        pull_request: { id: 100 },
        installation: { id: 123 },
      } as Parameters<typeof handleReviewSubmitted>[0],
      prisma,
    );

    expect(prisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reviewStatus: 'APPROVED' } }),
    );
  });
});

describe('handleInstallationRepositoriesChanged', () => {
  it('adds new repos to repositories list', async () => {
    const installation = {
      id: 'inst-1',
      installationId: 123,
      repositories: ['org/repo-a'],
      observedRepositories: ['org/repo-a'],
    };
    const prisma = createMockPrisma({
      gitHubInstallation: {
        findMany: vi.fn().mockResolvedValue([installation]),
        update: vi.fn(),
      },
    });

    await handleInstallationRepositoriesChanged(
      {
        action: 'added',
        installation: { id: 123 },
        repositories_added: [{ full_name: 'org/repo-b' }],
        repositories_removed: [],
      },
      prisma,
    );

    expect(prisma.gitHubInstallation.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: {
        repositories: ['org/repo-a', 'org/repo-b'],
        observedRepositories: ['org/repo-a'],
      },
    });
  });

  it('removes repos and prunes observed list', async () => {
    const installation = {
      id: 'inst-1',
      installationId: 123,
      repositories: ['org/repo-a', 'org/repo-b'],
      observedRepositories: ['org/repo-a', 'org/repo-b'],
    };
    const prisma = createMockPrisma({
      gitHubInstallation: {
        findMany: vi.fn().mockResolvedValue([installation]),
        update: vi.fn(),
      },
    });

    await handleInstallationRepositoriesChanged(
      {
        action: 'removed',
        installation: { id: 123 },
        repositories_added: [],
        repositories_removed: [{ full_name: 'org/repo-b' }],
      },
      prisma,
    );

    expect(prisma.gitHubInstallation.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: {
        repositories: ['org/repo-a'],
        observedRepositories: ['org/repo-a'],
      },
    });
  });
});
