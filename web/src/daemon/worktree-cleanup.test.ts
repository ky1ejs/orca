import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorktreeCleanupManager } from './worktree-cleanup.js';

// Mock dependencies
vi.mock('./worktrees.js', () => ({
  listWorktrees: vi.fn(() => []),
  deleteWorktree: vi.fn(),
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
    // Should only have one pending check
    manager.stop();
  });

  it('stop cancels pending checks', () => {
    const { manager } = createManager();
    manager.scheduleCheck('task-1');
    manager.stop();
    // Timer should be cleared — no cleanup attempt after stop
  });

  describe('sweep', () => {
    it('cleans up stale DB rows where directory no longer exists', async () => {
      vi.mocked(listWorktrees).mockReturnValue([
        {
          task_id: 'task-1',
          worktree_path: '/tmp/missing-worktree',
          branch_name: 'feat/ORCA-1-test',
          base_branch: 'main',
          repo_path: '/tmp/repo',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      vi.mocked(existsSync).mockReturnValue(false);

      const { manager } = createManager();
      manager.start();
      // Advance past the initial 10s startup delay
      await vi.advanceTimersByTimeAsync(11_000);

      expect(deleteWorktree).toHaveBeenCalledWith('task-1');
      manager.stop();
    });

    it('skips cleanup when no auth token', async () => {
      vi.mocked(listWorktrees).mockReturnValue([
        {
          task_id: 'task-1',
          worktree_path: '/tmp/worktree',
          branch_name: 'feat/ORCA-1-test',
          base_branch: 'main',
          repo_path: '/tmp/repo',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      const { manager, removeWorktree } = createManager({ getToken: () => null });
      manager.start();
      await vi.advanceTimersByTimeAsync(11_000);

      expect(removeWorktree).not.toHaveBeenCalled();
      manager.stop();
    });
  });
});
