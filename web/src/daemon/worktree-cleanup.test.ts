import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorktreeCleanupManager } from './worktree-cleanup.js';

// Mock dependencies
vi.mock('./worktrees.js', () => ({
  listWorktrees: vi.fn(() => []),
  deleteWorktree: vi.fn(),
  getWorktree: vi.fn(),
}));

vi.mock('./worktree-safety.js', () => ({
  checkWorktreeSafety: vi.fn(() => ({
    dirty: false,
    unpushedCommits: false,
    branchMerged: true,
  })),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
}));

vi.mock('./graphql-client.js', () => ({
  graphqlRequest: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { listWorktrees, deleteWorktree } = await import('./worktrees.js');
const { checkWorktreeSafety } = await import('./worktree-safety.js');
const { existsSync } = await import('node:fs');
const { graphqlRequest } = await import('./graphql-client.js');

const WORKTREE_ROW = {
  task_id: 'task-1',
  worktree_path: '/tmp/worktree',
  branch_name: 'feat/ORCA-1-test',
  base_branch: 'main',
  repo_path: '/tmp/repo',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function mockBackendResponse(status: string, prStatuses: string[] = [], autoCleanup = true) {
  vi.mocked(graphqlRequest).mockResolvedValue({
    data: {
      task: {
        status,
        pullRequests: prStatuses.map((s) => ({ status: s })),
        workspace: { settings: { autoCleanupWorktree: autoCleanup } },
      },
    },
  });
}

function createManager(overrides?: { backendUrl?: string; getToken?: () => string | null }) {
  const removeWorktree = vi.fn();
  const manager = new WorktreeCleanupManager({
    worktreeManager: { removeWorktree } as never,
    backendUrl: overrides?.backendUrl ?? 'http://localhost:4000',
    getToken: overrides?.getToken ?? (() => 'test-token'),
  });
  return { manager, removeWorktree };
}

describe('WorktreeCleanupManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(listWorktrees).mockReturnValue([]);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(checkWorktreeSafety).mockResolvedValue({
      dirty: false,
      unpushedCommits: false,
      branchMerged: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('scheduleCheck deduplicates by taskId', () => {
    const { manager } = createManager();
    manager.scheduleCheck('task-1');
    manager.scheduleCheck('task-1');

    // Only one timer should exist (initial sweep timeout doesn't count since start() wasn't called)
    expect(vi.getTimerCount()).toBe(1);

    manager.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop cancels pending checks and initial timeout', () => {
    const { manager } = createManager();
    manager.start();
    manager.scheduleCheck('task-1');

    // initial timeout + interval + scheduleCheck timeout
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2);

    manager.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('sweep', () => {
    it('cleans up stale DB rows where directory no longer exists', async () => {
      vi.mocked(listWorktrees).mockReturnValue([WORKTREE_ROW]);
      vi.mocked(existsSync).mockReturnValue(false);

      const { manager } = createManager();
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(deleteWorktree).toHaveBeenCalledWith('task-1');
      manager.stop();
    });

    it('skips cleanup when no auth token', async () => {
      vi.mocked(listWorktrees).mockReturnValue([WORKTREE_ROW]);

      const { manager, removeWorktree } = createManager({ getToken: () => null });
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(removeWorktree).not.toHaveBeenCalled();
      manager.stop();
    });

    it('removes worktree when task is DONE and branch is merged', async () => {
      vi.mocked(listWorktrees).mockReturnValue([WORKTREE_ROW]);
      mockBackendResponse('DONE', ['MERGED']);

      const { manager, removeWorktree } = createManager();
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(removeWorktree).toHaveBeenCalledWith('task-1');
      manager.stop();
    });

    it('does not remove worktree when working directory is dirty', async () => {
      vi.mocked(listWorktrees).mockReturnValue([WORKTREE_ROW]);
      mockBackendResponse('DONE', ['MERGED']);
      vi.mocked(checkWorktreeSafety).mockResolvedValue({
        dirty: true,
        unpushedCommits: false,
        branchMerged: true,
      });

      const { manager, removeWorktree } = createManager();
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(removeWorktree).not.toHaveBeenCalled();
      manager.stop();
    });

    it('does not remove worktree when branch is not merged and no PR merged', async () => {
      vi.mocked(listWorktrees).mockReturnValue([WORKTREE_ROW]);
      mockBackendResponse('DONE', ['OPEN']);
      vi.mocked(checkWorktreeSafety).mockResolvedValue({
        dirty: false,
        unpushedCommits: false,
        branchMerged: false,
      });

      const { manager, removeWorktree } = createManager();
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(removeWorktree).not.toHaveBeenCalled();
      manager.stop();
    });

    it('does not remove worktree when autoCleanupWorktree is disabled', async () => {
      vi.mocked(listWorktrees).mockReturnValue([WORKTREE_ROW]);
      mockBackendResponse('DONE', ['MERGED'], false);

      const { manager, removeWorktree } = createManager();
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(removeWorktree).not.toHaveBeenCalled();
      manager.stop();
    });

    it('does not remove worktree when task is IN_PROGRESS', async () => {
      vi.mocked(listWorktrees).mockReturnValue([WORKTREE_ROW]);
      mockBackendResponse('IN_PROGRESS', ['OPEN']);

      const { manager, removeWorktree } = createManager();
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(removeWorktree).not.toHaveBeenCalled();
      manager.stop();
    });
  });
});
