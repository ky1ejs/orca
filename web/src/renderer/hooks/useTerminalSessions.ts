import { useState, useEffect, useCallback, useRef } from 'react';
import { createPerfTimer, rendererPerfLog } from '../../shared/perf.js';
import { usePlatform } from '../platform/usePlatform.js';

export interface TerminalSessionInfo {
  id: string;
  task_id: string | null;
  pid: number | null;
  status: string;
  working_directory: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
}

const POLL_INTERVAL = 2000;

/** Fingerprint for structural equality — only fields that change during a session lifetime. */
function sessionsFingerprint(sessions: TerminalSessionInfo[]): string {
  return sessions.map((s) => `${s.id}:${s.status}`).join(',');
}

export function useTerminalSessions(taskId?: string) {
  const platform = usePlatform();
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const mountedRef = useRef(true);

  const initialFetchDone = useRef(false);

  const fetchSessions = useCallback(async () => {
    if (platform.kind !== 'electron') return;
    const isFirst = !initialFetchDone.current;
    const mark = isFirst ? createPerfTimer('sessions-fetch', rendererPerfLog) : null;
    try {
      const filtered = taskId
        ? ((await platform.orca.db.getSessionsByTask(taskId)) as TerminalSessionInfo[])
        : ((await platform.orca.db.getSessions()) as TerminalSessionInfo[]);
      if (!mountedRef.current) return;
      setSessions((prev) => {
        if (sessionsFingerprint(prev) === sessionsFingerprint(filtered)) return prev;
        return filtered;
      });
    } catch {
      // Daemon may not be running — silently ignore
    } finally {
      if (isFirst) {
        initialFetchDone.current = true;
        mark!('complete');
      }
    }
  }, [platform, taskId]);

  const refresh = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Reset perf timer for each new task. Don't clear sessions — the next
  // fetchSessions (triggered by the dependency chain) will atomically replace
  // them via the fingerprint check. Clearing to [] would unmount all
  // AgentTerminal instances, destroying xterm state and leaking unACKed
  // bytes in the daemon's flow control.
  useEffect(() => {
    if (!taskId) return;
    initialFetchDone.current = false;
  }, [taskId]);

  useEffect(() => {
    if (platform.kind !== 'electron') return;
    mountedRef.current = true;
    fetchSessions();

    const interval = setInterval(fetchSessions, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [platform, fetchSessions]);

  useEffect(() => {
    if (platform.kind !== 'electron') return;
    const unsubscribe = platform.orca.lifecycle.onSessionStatusChanged(
      (sessionId: string, status: string) => {
        setSessions((prev) => {
          const found = prev.some((s) => s.id === sessionId && s.status !== status);
          if (!found) return prev;
          return prev.map((s) => (s.id === sessionId ? { ...s, status } : s));
        });
      },
    );
    return unsubscribe;
  }, [platform]);

  return { sessions, refresh };
}
