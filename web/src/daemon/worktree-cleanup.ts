/**
 * Daemon-level worktree cleanup manager.
 *
 * Periodically sweeps all tracked worktrees and removes those whose tasks are
 * DONE (or CANCELLED), the workspace has autoCleanupWorktree enabled, and the
 * worktree passes safety checks. Also supports event-driven cleanup when a
 * session exits, with a delay to let post-exit operations settle.
 */
import { existsSync } from 'node:fs';
import type { InferSelectModel } from 'drizzle-orm';
import { listWorktrees, deleteWorktree, getWorktree } from './worktrees.js';
import { checkWorktreeSafety } from './worktree-safety.js';
import { graphqlRequest } from './graphql-client.js';
import type { WorktreeManager } from './worktree-manager.js';
import type { taskWorktree } from '../shared/db/schema.js';
import { logger } from './logger.js';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const POST_EXIT_DELAY_MS = 60 * 1000; // 60 seconds after session exit

type TaskWorktreeRow = InferSelectModel<typeof taskWorktree>;

interface CleanupManagerOptions {
  worktreeManager: WorktreeManager;
  backendUrl: string;
  getToken: () => string | null;
}

interface TaskCleanupInfo {
  status: string;
  hasMergedPr: boolean;
  autoCleanupWorktree: boolean;
}

const CLEANUP_INFO_QUERY = `
  query TaskCleanupInfo($id: ID!) {
    task(id: $id) {
      status
      pullRequests { status }
      workspace {
        settings { autoCleanupWorktree }
      }
    }
  }
`;

export class WorktreeCleanupManager {
  private interval: ReturnType<typeof setInterval> | null = null;
  private pendingChecks = new Map<string, ReturnType<typeof setTimeout>>();
  private worktreeManager: WorktreeManager;
  private backendUrl: string;
  private getToken: () => string | null;

  constructor(options: CleanupManagerOptions) {
    this.worktreeManager = options.worktreeManager;
    this.backendUrl = options.backendUrl;
    this.getToken = options.getToken;
  }

  start(): void {
    if (this.interval) return;
    // Run initial sweep shortly after daemon starts
    setTimeout(() => void this.sweep(), 10_000);
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    for (const timeout of this.pendingChecks.values()) {
      clearTimeout(timeout);
    }
    this.pendingChecks.clear();
  }

  /** Schedule a deferred cleanup check for a task (called on session exit). */
  scheduleCheck(taskId: string): void {
    if (this.pendingChecks.has(taskId)) return;
    const timeout = setTimeout(() => {
      this.pendingChecks.delete(taskId);
      const row = getWorktree(taskId);
      if (row) void this.tryCleanupRow(row);
    }, POST_EXIT_DELAY_MS);
    this.pendingChecks.set(taskId, timeout);
  }

  /** Iterate all worktrees and clean up safe ones. */
  private async sweep(): Promise<void> {
    const worktrees = listWorktrees();
    if (worktrees.length === 0) return;

    let cleaned = 0;
    let skipped = 0;

    for (const row of worktrees) {
      // Clean up stale DB rows where the directory no longer exists
      if (!existsSync(row.worktree_path)) {
        logger.info(`worktree-cleanup.stale-row taskId=${row.task_id} path=${row.worktree_path}`);
        deleteWorktree(row.task_id);
        cleaned++;
        continue;
      }

      const didClean = await this.tryCleanupRow(row);
      if (didClean) {
        cleaned++;
      } else {
        skipped++;
      }
    }

    if (cleaned > 0 || skipped > 0) {
      logger.info(`worktree-cleanup.sweep cleaned=${cleaned} skipped=${skipped}`);
    }
  }

  /** Attempt to clean up a single worktree. Returns true if removed. */
  private async tryCleanupRow(row: TaskWorktreeRow): Promise<boolean> {
    try {
      const info = await this.fetchTaskCleanupInfo(row.task_id);
      if (!info) return false; // Backend unreachable or task not found

      if (!info.autoCleanupWorktree) return false;

      // Only clean up tasks that are DONE or CANCELLED
      if (info.status !== 'DONE' && info.status !== 'CANCELLED') return false;

      if (!existsSync(row.worktree_path)) {
        deleteWorktree(row.task_id);
        return true;
      }

      const safety = await checkWorktreeSafety(
        row.worktree_path,
        row.repo_path,
        row.branch_name,
        row.base_branch,
      );

      // Don't remove dirty worktrees
      if (safety.dirty) return false;

      // For CANCELLED tasks, skip merge check — user explicitly cancelled
      if (info.status === 'CANCELLED') {
        // Still don't remove if there are unpushed commits (work would be lost)
        if (safety.unpushedCommits) return false;
      } else {
        // For DONE tasks, require branch merged or PR merged
        const merged = safety.branchMerged || info.hasMergedPr;
        if (!merged) return false;
      }

      await this.worktreeManager.removeWorktree(row.task_id);
      logger.info(`worktree-cleanup.removed taskId=${row.task_id} path=${row.worktree_path}`);
      return true;
    } catch (err) {
      logger.warn(
        `worktree-cleanup.error taskId=${row.task_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** Query the backend for task status, PR info, and workspace settings. */
  private async fetchTaskCleanupInfo(taskId: string): Promise<TaskCleanupInfo | null> {
    const token = this.getToken();
    if (!token) return null;

    const result = await graphqlRequest<{
      data?: {
        task?: {
          status: string;
          pullRequests: Array<{ status: string }>;
          workspace: {
            settings: { autoCleanupWorktree: boolean } | null;
          };
        };
      };
    }>(this.backendUrl, token, CLEANUP_INFO_QUERY, { id: taskId });

    const task = result?.data?.task;
    if (!task) return null;

    return {
      status: task.status,
      hasMergedPr: task.pullRequests.some((pr) => pr.status === 'MERGED'),
      autoCleanupWorktree: task.workspace.settings?.autoCleanupWorktree ?? true,
    };
  }
}
