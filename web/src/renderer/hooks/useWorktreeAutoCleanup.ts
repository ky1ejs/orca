import { useEffect, useRef } from 'react';
import { useSubscription } from 'urql';
import { TaskChangedDocument, TaskStatus } from '../graphql/__generated__/generated.js';

/**
 * Watches for tasks moving to DONE and auto-removes their worktree
 * if autoCleanupWorktree is enabled and the worktree is safe to clean.
 */
export function useWorktreeAutoCleanup(workspaceId: string, autoCleanupWorktree: boolean): void {
  const cleanedRef = useRef(new Set<string>());

  const [{ data }] = useSubscription({
    query: TaskChangedDocument,
    variables: { workspaceId },
    pause: !workspaceId || !autoCleanupWorktree,
  });

  useEffect(() => {
    if (!data?.taskChanged || !autoCleanupWorktree) return;

    const task = data.taskChanged;
    if (task.status !== TaskStatus.Done) return;
    if (cleanedRef.current.has(task.id)) return;

    cleanedRef.current.add(task.id);

    void (async () => {
      const safety = await window.orca.worktree.safety(task.id);
      if (!safety) return;
      if (safety.dirty || safety.unpushedCommits || !safety.branchMerged) return;

      await window.orca.worktree.remove(task.id);
    })();
  }, [data, autoCleanupWorktree]);
}
