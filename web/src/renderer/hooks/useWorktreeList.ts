import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorktreeListResult } from '../../shared/daemon-protocol.js';

const REFRESH_INTERVAL_MS = 30_000;

interface UseWorktreeListResult {
  worktrees: WorktreeListResult[];
  loading: boolean;
  removeWorktree: (taskId: string, force?: boolean) => Promise<void>;
  refetch: () => void;
}

export function useWorktreeList(): UseWorktreeListResult {
  const [worktrees, setWorktrees] = useState<WorktreeListResult[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);
  const hasFetchedRef = useRef(false);
  const pendingFetchRef = useRef<Promise<void> | null>(null);

  const doFetch = useCallback(() => {
    const id = ++fetchIdRef.current;
    if (!hasFetchedRef.current) setLoading(true);
    const promise = window.orca.worktree
      .list()
      .then((results) => {
        if (fetchIdRef.current === id) setWorktrees(results);
      })
      .catch(() => {
        // Preserve previous state on transient errors
      })
      .finally(() => {
        if (fetchIdRef.current === id) {
          hasFetchedRef.current = true;
          setLoading(false);
          pendingFetchRef.current = null;
        }
      });
    pendingFetchRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    doFetch();
    const interval = setInterval(doFetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [doFetch]);

  const removeWorktree = useCallback(
    async (taskId: string, force?: boolean) => {
      await window.orca.worktree.remove(taskId, force);
      await doFetch();
    },
    [doFetch],
  );

  return { worktrees, loading, removeWorktree, refetch: doFetch };
}
