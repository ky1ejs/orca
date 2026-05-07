import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorktreeListResult } from '../../shared/daemon-protocol.js';
import { usePlatform } from '../platform/usePlatform.js';

const REFRESH_INTERVAL_MS = 30_000;

interface UseWorktreeListResult {
  worktrees: WorktreeListResult[];
  loading: boolean;
  removeWorktree: (taskId: string, force?: boolean) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useWorktreeList(): UseWorktreeListResult {
  const platform = usePlatform();
  const [worktrees, setWorktrees] = useState<WorktreeListResult[]>([]);
  const [loading, setLoading] = useState(platform.kind === 'electron');
  const fetchIdRef = useRef(0);
  const hasFetchedRef = useRef(false);
  const pendingFetchRef = useRef<Promise<void> | null>(null);

  const doFetch = useCallback(() => {
    if (platform.kind !== 'electron') {
      setLoading(false);
      return Promise.resolve();
    }
    const id = ++fetchIdRef.current;
    if (!hasFetchedRef.current) setLoading(true);
    const promise = platform.orca.worktree
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
  }, [platform]);

  useEffect(() => {
    if (platform.kind !== 'electron') return;
    doFetch();
    const interval = setInterval(doFetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [platform, doFetch]);

  const removeWorktree = useCallback(
    async (taskId: string, force?: boolean) => {
      if (platform.kind !== 'electron') return;
      await platform.orca.worktree.remove(taskId, force);
      await doFetch();
    },
    [platform, doFetch],
  );

  return { worktrees, loading, removeWorktree, refetch: doFetch };
}
