import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../graphql/client.js';

interface BackendStatusState {
  connected: boolean;
  error: string | null;
}

const HEALTH_URL = `${BACKEND_URL}/health`;
const POLL_INTERVAL_MS = 10_000;

export function useBackendStatus(): BackendStatusState {
  const [state, setState] = useState<BackendStatusState>({
    connected: true,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(HEALTH_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const connected = res.ok;
      const error = connected ? null : `HTTP ${res.status}`;
      setState((prev) => {
        if (prev.connected === connected && prev.error === error) return prev;
        return { connected, error };
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Backend unreachable';
      setState((prev) => {
        if (!prev.connected && prev.error === error) return prev;
        return { connected: false, error };
      });
    }
  }, []);

  useEffect(() => {
    checkHealth();
    intervalRef.current = setInterval(checkHealth, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkHealth]);

  return state;
}
