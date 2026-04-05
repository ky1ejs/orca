import { useEffect, useRef } from 'react';
import { TaskStatus } from '../graphql/__generated__/generated.js';

/**
 * Watches for tasks moving to DONE and auto-removes their worktree
 * if autoCleanupWorktree is enabled and the worktree is safe to clean.
 *
 * Receives the latest changed task from the existing TaskChanged subscription
 * to avoid opening a duplicate subscription.
 */
export function useWorktreeAutoCleanup(
  autoCleanupWorktree: boolean,
  changedTask: { id: string; status: string } | undefined,
): void {
  const cleanedRef = useRef(new Set<string>());
  const prevAutoCleanup = useRef(autoCleanupWorktree);

  // Reset cleaned set when the setting changes (e.g., workspace switch)
  useEffect(() => {
    if (prevAutoCleanup.current !== autoCleanupWorktree) {
      cleanedRef.current.clear();
      prevAutoCleanup.current = autoCleanupWorktree;
    }
  }, [autoCleanupWorktree]);

  useEffect(() => {
    if (!changedTask || !autoCleanupWorktree) return;
    if (changedTask.status !== TaskStatus.Done) return;
    if (cleanedRef.current.has(changedTask.id)) return;

    void (async () => {
      try {
        const safety = await window.orca.worktree.safety(changedTask.id);
        if (!safety) return;
        if (safety.dirty) return;
        const merged = safety.branchMerged || safety.prMerged;
        if (!merged) return;

        await window.orca.worktree.remove(changedTask.id);
        cleanedRef.current.add(changedTask.id);
      } catch {
        // Transient failure — don't mark as cleaned so it retries next event
      }
    })();
  }, [changedTask, autoCleanupWorktree]);
}
