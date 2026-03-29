import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorktreeGetResult, WorktreeSafetyResult } from '../../shared/daemon-protocol.js';

interface UseWorktreeResult {
  worktree: WorktreeGetResult | null;
  safety: WorktreeSafetyResult | null;
  loading: boolean;
  removeWorktree: (force?: boolean) => Promise<void>;
  refetch: () => void;
}

export function useWorktree(taskId: string | undefined): UseWorktreeResult {
  const [worktree, setWorktree] = useState<WorktreeGetResult | null>(null);
  const [safety, setSafety] = useState<WorktreeSafetyResult | null>(null);
  const [loading, setLoading] = useState(!!taskId);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    if (!taskId) {
      setWorktree(null);
      setSafety(null);
      setLoading(false);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);
    Promise.all([window.orca.worktree.get(taskId), window.orca.worktree.safety(taskId)])
      .then(([wt, s]) => {
        if (fetchIdRef.current === id) {
          setWorktree(wt ?? null);
          setSafety(wt ? s : null);
        }
      })
      .catch(() => {
        if (fetchIdRef.current === id) {
          setWorktree(null);
          setSafety(null);
        }
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

  return { worktree, safety, loading, removeWorktree, refetch: doFetch };
}
