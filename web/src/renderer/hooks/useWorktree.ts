import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorktreeGetResult, WorktreeSafetyResult } from '../../shared/daemon-protocol.js';
import { usePlatform } from '../platform/usePlatform.js';

interface UseWorktreeResult {
  worktree: WorktreeGetResult | null;
  safety: WorktreeSafetyResult | null;
  loading: boolean;
  removeWorktree: (force?: boolean) => Promise<void>;
  refetch: () => void;
}

export function useWorktree(taskId: string | undefined): UseWorktreeResult {
  const platform = usePlatform();
  const [worktree, setWorktree] = useState<WorktreeGetResult | null>(null);
  const [safety, setSafety] = useState<WorktreeSafetyResult | null>(null);
  const [loading, setLoading] = useState(platform.kind === 'electron' && !!taskId);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    if (platform.kind !== 'electron' || !taskId) {
      setWorktree(null);
      setSafety(null);
      setLoading(false);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);
    Promise.all([platform.orca.worktree.get(taskId), platform.orca.worktree.safety(taskId)])
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
  }, [platform, taskId]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const removeWorktree = useCallback(
    async (force?: boolean) => {
      if (platform.kind !== 'electron' || !taskId) return;
      await platform.orca.worktree.remove(taskId, force);
      doFetch();
    },
    [platform, taskId, doFetch],
  );

  return { worktree, safety, loading, removeWorktree, refetch: doFetch };
}
