import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaemonStatusResult } from '../../shared/daemon-protocol.js';
import { usePlatform } from '../platform/usePlatform.js';

interface DaemonStatusState {
  connected: boolean;
  status: DaemonStatusResult | null;
  error: string | null;
}

export function useDaemonStatus(): DaemonStatusState & { refresh: () => void } {
  const platform = usePlatform();
  const [state, setState] = useState<DaemonStatusState>({
    connected: platform.kind === 'electron',
    status: null,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (platform.kind !== 'electron') return;
    try {
      const result = await platform.orca.daemon.getStatus();
      setState({ connected: true, status: result, error: null });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connected: false,
        error: err instanceof Error ? err.message : 'Failed to fetch daemon status',
      }));
    }
  }, [platform]);

  useEffect(() => {
    if (platform.kind !== 'electron') return;
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [platform, fetchStatus]);

  // Track daemon disconnect/reconnect events
  useEffect(() => {
    if (platform.kind !== 'electron') return;

    const unsubDisconnect = platform.orca.lifecycle.onDaemonDisconnected(() => {
      setState((prev) => ({ ...prev, connected: false }));
    });

    const unsubReconnect = platform.orca.lifecycle.onDaemonReconnected(() => {
      fetchStatus();
    });

    return () => {
      unsubDisconnect();
      unsubReconnect();
    };
  }, [platform, fetchStatus]);

  return { ...state, refresh: fetchStatus };
}
