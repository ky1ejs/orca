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

/** Cache of recent fetches to avoid redundant `git fetch` in loops. Keyed by "repo::branch". */
const recentFetches = new Map<string, number>();
const FETCH_TTL_MS = 60_000; // 1 minute

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

  // Check for unpushed commits. The old approach (`git log @{u}..HEAD`) fails
  // when no upstream tracking branch is set (common for worktree branches),
  // defaulting to "has unpushed commits". Instead, check against the remote
  // branch directly, falling back to comparing against the base branch.
  try {
    const log = await git(worktreePath, ['log', `origin/${branchName}..HEAD`, '--oneline']);
    unpushedCommits = log.length > 0;
  } catch {
    // No remote branch — check if there are any commits beyond the base branch
    try {
      const log = await git(worktreePath, ['log', `${baseBranch}..HEAD`, '--oneline']);
      unpushedCommits = log.length > 0;
    } catch {
      unpushedCommits = true; // Conservative fallback
    }
  }

  // Check if the branch is merged into the base branch. Fetch the remote base
  // branch first so we detect PRs merged on GitHub even if the local branch
  // hasn't been updated. Skip fetch if we already fetched this repo recently
  // (avoids redundant network calls when checking multiple worktrees in a loop).
  const fetchKey = `${repoPath}::${baseBranch}`;
  const lastFetch = recentFetches.get(fetchKey);
  if (!lastFetch || Date.now() - lastFetch > FETCH_TTL_MS) {
    try {
      await git(repoPath, ['fetch', 'origin', baseBranch]);
      recentFetches.set(fetchKey, Date.now());
    } catch {
      // Offline or no remote — continue with whatever local state exists
    }
  }

  try {
    const merged = await git(repoPath, ['branch', '--merged', `origin/${baseBranch}`]);
    // git branch --merged prefixes the current branch with "* ", so strip it
    branchMerged = merged.split('\n').some((b) => b.replace(/^\*\s*/, '').trim() === branchName);
  } catch {
    // Fallback to checking against local base branch
    try {
      const merged = await git(repoPath, ['branch', '--merged', baseBranch]);
      branchMerged = merged.split('\n').some((b) => b.replace(/^\*\s*/, '').trim() === branchName);
    } catch (err) {
      logger.warn(`worktree-safety: failed to check merge status: ${err}`);
      branchMerged = false;
    }
  }

  return { dirty, unpushedCommits, branchMerged };
}
