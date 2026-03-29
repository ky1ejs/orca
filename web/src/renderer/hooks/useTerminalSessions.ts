import { useState, useEffect, useCallback, useRef } from 'react';
import { createPerfTimer, rendererPerfLog } from '../../shared/perf.js';

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

/** True when running inside Electron (window.orca is injected by preload). */
function hasElectronApi(): boolean {
  return typeof window !== 'undefined' && !!window.orca;
}

/** Fingerprint for structural equality — only fields that change during a session lifetime. */
function sessionsFingerprint(sessions: TerminalSessionInfo[]): string {
  return sessions.map((s) => `${s.id}:${s.status}`).join(',');
}

export function useTerminalSessions(taskId?: string) {
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const mountedRef = useRef(true);

  const initialFetchDone = useRef(false);

  const fetchSessions = useCallback(async () => {
    if (!window.orca?.db) return;
    const isFirst = !initialFetchDone.current;
    const mark = isFirst ? createPerfTimer('sessions-fetch', rendererPerfLog) : null;
    try {
      const filtered = taskId
        ? ((await window.orca.db.getSessionsByTask(taskId)) as TerminalSessionInfo[])
        : ((await window.orca.db.getSessions()) as TerminalSessionInfo[]);
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
  }, [taskId]);

  const refresh = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Clear stale sessions immediately when navigating to a different task.
  // We intentionally do NOT set loading=true here — that would unmount the
  // TerminalPanel and destroy all xterm instances, forcing a full replay cycle
  // on remount. Instead, clearing sessions lets the panel show an empty state
  // briefly while the (near-instant) fetch completes.
  useEffect(() => {
    if (!taskId) return;
    initialFetchDone.current = false;
    setSessions([]);
  }, [taskId]);

  useEffect(() => {
    if (!hasElectronApi()) return;
    mountedRef.current = true;
    fetchSessions();

    if (!window.orca?.db) return;
    const interval = setInterval(fetchSessions, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchSessions]);

  useEffect(() => {
    if (!window.orca?.lifecycle) return;
    const unsubscribe = window.orca.lifecycle.onSessionStatusChanged(
      (sessionId: string, status: string) => {
        setSessions((prev) => {
          const found = prev.some((s) => s.id === sessionId && s.status !== status);
          if (!found) return prev;
          return prev.map((s) => (s.id === sessionId ? { ...s, status } : s));
        });
      },
    );
    return unsubscribe;
  }, []);

  return { sessions, refresh };
}
