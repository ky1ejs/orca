/**
 * WorktreeManager — creates, reuses, and removes git worktrees for task isolation.
 *
 * Each task gets its own worktree at ~/.orca/worktrees/<repo-name>/<branch-name>/.
 * Worktrees are created on demand at agent launch time, not on task creation.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getWorktree, insertWorktree, deleteWorktree } from './worktrees.js';
import { WorktreeError } from '../shared/errors.js';
import { ORCA_DIR } from '../shared/daemon-protocol.js';
import type { TaskMetadata } from '../shared/daemon-protocol.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const DEFAULT_WORKTREES_DIR = join(ORCA_DIR, 'worktrees');

/** Convert a task title into a URL-safe slug for branch naming. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/** Strip path separators and `..` segments from a string to prevent path traversal. */
function sanitizePathComponent(value: string): string {
  return value.replace(/[/\\]/g, '-').replace(/\.\./g, '-');
}

/** Check whether a directory is inside a git work tree. */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', [
      '-C',
      dir,
      'rev-parse',
      '--is-inside-work-tree',
    ]);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args]);
  return stdout.trim();
}

/** Resolve the git repo root from any directory inside the repo. */
async function resolveRepoRoot(dir: string): Promise<string> {
  return git(dir, ['rev-parse', '--show-toplevel']);
}

async function detectBaseBranch(repoPath: string): Promise<string> {
  try {
    // e.g. "refs/remotes/origin/main" -> "main"
    const ref = await git(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    return ref.replace(/^refs\/remotes\/origin\//, '');
  } catch {
    return git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  }
}

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await git(repoPath, ['rev-parse', '--verify', branch]);
    return true;
  } catch {
    return false;
  }
}

export class WorktreeManager {
  private repoLocks = new Map<string, Promise<void>>();
  private worktreesDir: string;

  constructor(worktreesDir?: string) {
    this.worktreesDir = worktreesDir ?? DEFAULT_WORKTREES_DIR;
  }

  /**
   * Ensure a worktree exists for the given task. Creates one if needed,
   * reuses an existing one if the row + directory are intact.
   *
   * @returns The worktree path and whether it was newly created.
   */
  async ensureWorktree(
    taskId: string,
    workingDirectory: string,
    metadata: TaskMetadata,
  ): Promise<{ path: string; created: boolean; repoPath: string }> {
    // Resolve the canonical repo root so locking, naming, and storage are
    // consistent regardless of whether workingDirectory is a subdirectory.
    const repoPath = await resolveRepoRoot(workingDirectory);

    return this.withRepoLock(repoPath, async () => {
      const start = Date.now();

      const existing = getWorktree(taskId);
      if (existing) {
        // Validate that the existing worktree belongs to the same repo
        if (existing.repo_path === repoPath && existsSync(existing.worktree_path)) {
          logger.info(`worktree.reused taskId=${taskId} path=${existing.worktree_path}`);
          return { path: existing.worktree_path, created: false, repoPath };
        }
        // Stale row — directory was deleted externally or repo changed
        logger.info(`worktree.stale-row-cleaned taskId=${taskId} path=${existing.worktree_path}`);
        deleteWorktree(taskId);
      }

      const baseBranch = await detectBaseBranch(repoPath);
      const slug = slugify(metadata.title);
      const safeDisplayId = sanitizePathComponent(metadata.displayId);
      const branchName = slug ? `feat/${safeDisplayId}-${slug}` : `feat/${safeDisplayId}`;
      const repoName = basename(repoPath);
      const worktreePath = join(this.worktreesDir, repoName, branchName);

      // Branch name contains `/`, so ensure parent directory exists
      mkdirSync(join(this.worktreesDir, repoName, 'feat'), { recursive: true });

      // Fetch latest from origin so worktree starts from up-to-date state.
      // Prefer origin/<baseBranch> if available, else local branch.
      let startPoint = baseBranch;
      try {
        await git(repoPath, ['fetch', 'origin', baseBranch]);
        startPoint = `origin/${baseBranch}`;
      } catch (err) {
        logger.warn(
          `Failed to fetch origin/${baseBranch} — using local branch: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      try {
        if (await branchExists(repoPath, branchName)) {
          await git(repoPath, ['worktree', 'add', worktreePath, branchName]);
        } else {
          await git(repoPath, ['worktree', 'add', '-b', branchName, worktreePath, startPoint]);
        }
      } catch (err) {
        throw new WorktreeError(
          `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Rollback worktree on DB insert failure
      try {
        insertWorktree({
          task_id: taskId,
          worktree_path: worktreePath,
          branch_name: branchName,
          base_branch: baseBranch,
          repo_path: repoPath,
        });
      } catch (err) {
        try {
          await git(repoPath, ['worktree', 'remove', worktreePath, '--force']);
        } catch {
          // Best-effort cleanup
        }
        throw new WorktreeError(
          `Failed to record worktree: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const durationMs = Date.now() - start;
      logger.info(
        `worktree.created taskId=${taskId} branch=${branchName} path=${worktreePath} baseBranch=${baseBranch} durationMs=${durationMs}`,
      );

      return { path: worktreePath, created: true, repoPath };
    });
  }

  /**
   * Remove a worktree for the given task.
   * Runs `git worktree remove`, deletes the branch, and removes the DB row.
   */
  async removeWorktree(taskId: string, force?: boolean): Promise<void> {
    const row = getWorktree(taskId);
    if (!row) return;

    if (existsSync(row.worktree_path)) {
      try {
        const args = ['worktree', 'remove', row.worktree_path];
        if (force) args.push('--force');
        await git(row.repo_path, args);
      } catch (err) {
        throw new WorktreeError(
          `Failed to remove worktree: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      try {
        await git(row.repo_path, ['branch', '-D', row.branch_name]);
      } catch {
        // Branch may already be gone or was never created
      }
    }

    deleteWorktree(taskId);

    logger.info(`worktree.removed taskId=${taskId} path=${row.worktree_path}`);
  }

  private async withRepoLock<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.repoLocks.get(repoPath) ?? Promise.resolve();
    let release: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    this.repoLocks.set(repoPath, next);

    try {
      await prev;
      return await fn();
    } finally {
      release!();
      if (this.repoLocks.get(repoPath) === next) {
        this.repoLocks.delete(repoPath);
      }
    }
  }
}
