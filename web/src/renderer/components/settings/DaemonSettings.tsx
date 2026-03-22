import { useState, useCallback, useEffect, useRef } from 'react';
import { useDaemonStatus } from '../../hooks/useDaemonStatus.js';

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function DaemonSettings() {
  const { connected, status, error, refresh } = useDaemonStatus();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, []);

  const handleRestart = useCallback(async () => {
    if (!window.orca?.lifecycle) return;
    setRestarting(true);
    try {
      await window.orca.lifecycle.forceRestartDaemon();
    } finally {
      setRestarting(false);
      setConfirmRestart(false);
      // Give the daemon a moment to come back up before refreshing
      restartTimerRef.current = setTimeout(refresh, 1000);
    }
  }, [refresh]);

  return (
    <div>
      <h2 className="text-label-md font-medium text-fg mb-4">Daemon</h2>
      <div className="bg-surface-inset border border-edge-subtle rounded-lg p-4 space-y-4">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <span
            data-testid="status-indicator"
            className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? 'bg-success' : 'bg-error'}`}
          />
          <span className="text-label-md text-fg">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {error && <p className="text-body-sm text-error">{error}</p>}

        {status && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-label-sm text-fg-muted">Version</p>
              <p className="text-label-md text-fg">{status.version}</p>
            </div>
            <div>
              <p className="text-label-sm text-fg-muted">Protocol Version</p>
              <p className="text-label-md text-fg">{status.protocolVersion}</p>
            </div>
            <div>
              <p className="text-label-sm text-fg-muted">Uptime</p>
              <p className="text-label-md text-fg">{formatUptime(status.uptime)}</p>
            </div>
            <div>
              <p className="text-label-sm text-fg-muted">Active Sessions</p>
              <p className="text-label-md text-fg">{status.activeSessions}</p>
            </div>
            <div>
              <p className="text-label-sm text-fg-muted">Connected Clients</p>
              <p className="text-label-md text-fg">{status.connectedClients}</p>
            </div>
          </div>
        )}

        {/* Restart */}
        <div className="pt-2 border-t border-edge-subtle">
          {!confirmRestart ? (
            <button
              onClick={() => setConfirmRestart(true)}
              className="px-4 py-2 text-label-md text-error border border-error/30 hover:bg-error/10 rounded transition-colors"
            >
              Restart Daemon
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {status && status.activeSessions > 0 && (
                <span className="text-body-sm text-fg-muted">
                  {status.activeSessions} active session
                  {status.activeSessions === 1 ? '' : 's'} will be interrupted.
                </span>
              )}
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="px-4 py-2 bg-error-muted hover:bg-error-strong text-error text-label-md rounded transition-colors disabled:opacity-50"
              >
                {restarting ? 'Restarting...' : 'Confirm Restart'}
              </button>
              <button
                onClick={() => setConfirmRestart(false)}
                className="px-3 py-2 text-label-md text-fg-muted hover:text-fg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
