import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaemonStatusResult } from '../../shared/daemon-protocol.js';

interface DaemonStatusState {
  connected: boolean;
  status: DaemonStatusResult | null;
  error: string | null;
}

export function useDaemonStatus(): DaemonStatusState & { refresh: () => void } {
  const [state, setState] = useState<DaemonStatusState>({
    connected: true,
    status: null,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!window.orca?.daemon) return;
    try {
      const result = await window.orca.daemon.getStatus();
      setState({ connected: true, status: result, error: null });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connected: false,
        error: err instanceof Error ? err.message : 'Failed to fetch daemon status',
      }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  // Track daemon disconnect/reconnect events
  useEffect(() => {
    if (!window.orca?.lifecycle) return;

    const unsubDisconnect = window.orca.lifecycle.onDaemonDisconnected(() => {
      setState((prev) => ({ ...prev, connected: false }));
    });

    const unsubReconnect = window.orca.lifecycle.onDaemonReconnected(() => {
      fetchStatus();
    });

    return () => {
      unsubDisconnect();
      unsubReconnect();
    };
  }, [fetchStatus]);

  return { ...state, refresh: fetchStatus };
}
