import { useState, useEffect, useCallback, useRef } from 'react';

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

export function useTerminalSessions(taskId?: string) {
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [loading, setLoading] = useState(hasElectronApi());
  const mountedRef = useRef(true);

  const fetchSessions = useCallback(async () => {
    if (!window.orca?.db) {
      setLoading(false);
      return;
    }
    const all = (await window.orca.db.getSessions()) as TerminalSessionInfo[];
    if (!mountedRef.current) return;
    const filtered = taskId ? all.filter((s) => s.task_id === taskId) : all;
    setSessions(filtered);
    setLoading(false);
  }, [taskId]);

  const refresh = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

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
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status } : s)));
      },
    );
    return unsubscribe;
  }, []);

  return { sessions, loading, refresh };
}
