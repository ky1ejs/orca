/**
 * Worktree safety checks — determines whether a worktree is safe to auto-clean.
 */
import { git } from './git.js';
import { logger } from './logger.js';

interface WorktreeSafetyStatus {
  dirty: boolean;
  unpushedCommits: boolean;
  branchMerged: boolean;
}

/**
 * Check whether a worktree is safe to auto-clean.
 * Returns the safety status for the worktree's working directory.
 */
export async function checkWorktreeSafety(
  worktreePath: string,
  repoPath: string,
  branchName: string,
  baseBranch: string,
): Promise<WorktreeSafetyStatus> {
  let dirty = false;
  let unpushedCommits = false;
  let branchMerged = false;

  try {
    const status = await git(worktreePath, ['status', '--porcelain']);
    dirty = status.length > 0;
  } catch (err) {
    logger.warn(`worktree-safety: failed to check dirty status: ${err}`);
    dirty = true; // Assume dirty on error (conservative)
  }

  try {
    const log = await git(worktreePath, ['log', '@{u}..HEAD', '--oneline']);
    unpushedCommits = log.length > 0;
  } catch {
    // No upstream tracking branch — treat as having unpushed commits
    unpushedCommits = true;
  }

  try {
    const merged = await git(repoPath, ['branch', '--merged', baseBranch]);
    branchMerged = merged.split('\n').some((b) => b.trim() === branchName);
  } catch (err) {
    logger.warn(`worktree-safety: failed to check merge status: ${err}`);
    branchMerged = false;
  }

  return { dirty, unpushedCommits, branchMerged };
}
