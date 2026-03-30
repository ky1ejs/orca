import { useState, useEffect, useRef, useCallback } from 'react';

/** Max output lines retained in the hook state. */
const MAX_LINES = 500;

export interface BootstrapStatus {
  state: 'idle' | 'running' | 'completed' | 'failed';
  lines: string[];
  error: string | null;
}

const IDLE_STATUS: BootstrapStatus = { state: 'idle', lines: [], error: null };

/**
 * Tracks bootstrap status for a given worktree path.
 * Queries initial state from the daemon, then subscribes to live events.
 */
export function useBootstrapStatus(worktreePath: string | null | undefined): BootstrapStatus {
  const [status, setStatus] = useState<BootstrapStatus>(IDLE_STATUS);
  const linesRef = useRef<string[]>([]);

  // Reset when worktree path changes
  useEffect(() => {
    linesRef.current = [];
    setStatus(IDLE_STATUS);
  }, [worktreePath]);

  // Query initial status from daemon
  useEffect(() => {
    if (!worktreePath || !window.orca?.bootstrap?.status) return;

    let cancelled = false;
    window.orca.bootstrap
      .status(worktreePath)
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'running') {
          linesRef.current = result.lines;
          setStatus({ state: 'running', lines: result.lines, error: null });
        } else if (result.status === 'completed') {
          setStatus({ state: 'completed', lines: [], error: null });
        }
        // 'pending' stays as 'idle' — bootstrap hasn't started yet
      })
      .catch(() => {
        // Daemon may not be reachable
      });

    return () => {
      cancelled = true;
    };
  }, [worktreePath]);

  // Subscribe to live bootstrap events
  const handleOutput = useCallback(
    (eventWorktreePath: string, newLines: string[]) => {
      if (eventWorktreePath !== worktreePath) return;
      const current = linesRef.current;
      const combined = [...current, ...newLines];
      if (combined.length > MAX_LINES) {
        combined.splice(0, combined.length - MAX_LINES);
      }
      linesRef.current = combined;
      setStatus({ state: 'running', lines: combined, error: null });
    },
    [worktreePath],
  );

  const handleCompleted = useCallback(
    (eventWorktreePath: string) => {
      if (eventWorktreePath !== worktreePath) return;
      setStatus({ state: 'completed', lines: linesRef.current, error: null });
    },
    [worktreePath],
  );

  const handleFailed = useCallback(
    (eventWorktreePath: string, error: string) => {
      if (eventWorktreePath !== worktreePath) return;
      setStatus({ state: 'failed', lines: linesRef.current, error });
    },
    [worktreePath],
  );

  useEffect(() => {
    if (!worktreePath || !window.orca?.lifecycle) return;

    const unsubs = [
      window.orca.lifecycle.onBootstrapOutput?.(handleOutput),
      window.orca.lifecycle.onBootstrapCompleted?.(handleCompleted),
      window.orca.lifecycle.onBootstrapFailed?.(handleFailed),
    ].filter(Boolean) as (() => void)[];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [worktreePath, handleOutput, handleCompleted, handleFailed]);

  return status;
}
