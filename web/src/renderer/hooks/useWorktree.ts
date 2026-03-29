import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorktreeGetResult } from '../../shared/daemon-protocol.js';

interface UseWorktreeResult {
  worktree: WorktreeGetResult | null;
  loading: boolean;
  removeWorktree: (force?: boolean) => Promise<void>;
  refetch: () => void;
}

export function useWorktree(taskId: string | undefined): UseWorktreeResult {
  const [worktree, setWorktree] = useState<WorktreeGetResult | null>(null);
  const [loading, setLoading] = useState(!!taskId);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    if (!taskId) {
      setWorktree(null);
      setLoading(false);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);
    window.orca.worktree
      .get(taskId)
      .then((result) => {
        if (fetchIdRef.current === id) setWorktree(result ?? null);
      })
      .catch(() => {
        if (fetchIdRef.current === id) setWorktree(null);
      })
      .finally(() => {
        if (fetchIdRef.current === id) setLoading(false);
      });
  }, [taskId]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const removeWorktree = useCallback(
    async (force?: boolean) => {
      if (!taskId) return;
      await window.orca.worktree.remove(taskId, force);
      doFetch();
    },
    [taskId, doFetch],
  );

  return { worktree, loading, removeWorktree, refetch: doFetch };
}
