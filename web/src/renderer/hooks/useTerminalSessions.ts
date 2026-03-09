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

export function useTerminalSessions(taskId?: string) {
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchSessions = useCallback(async () => {
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
    mountedRef.current = true;
    fetchSessions();

    const interval = setInterval(fetchSessions, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchSessions]);

  useEffect(() => {
    const unsubscribe = window.orca.lifecycle.onSessionStatusChanged((sessionId, status) => {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status } : s)));
    });
    return unsubscribe;
  }, []);

  return { sessions, loading, refresh };
}
