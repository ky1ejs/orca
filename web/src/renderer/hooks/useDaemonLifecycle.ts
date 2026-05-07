import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/toast/ToastProvider.js';
import { usePlatform } from '../platform/usePlatform.js';

interface ProtocolUpdateState {
  required: boolean;
  activeSessions: number;
}

/**
 * Listens to daemon lifecycle events and shows toasts for
 * disconnect/reconnect/interrupted sessions.
 * Returns protocol update state when a breaking daemon update is pending.
 */
export function useDaemonLifecycle(): {
  protocolUpdate: ProtocolUpdateState;
  confirmProtocolUpdate: () => void;
} {
  const platform = usePlatform();
  const { addToast, removeToast } = useToast();
  const disconnectToastId = useRef<string | null>(null);
  const [protocolUpdate, setProtocolUpdate] = useState<ProtocolUpdateState>({
    required: false,
    activeSessions: 0,
  });

  const confirmProtocolUpdate = useCallback(async () => {
    if (platform.kind !== 'electron') return;
    await platform.orca.lifecycle.forceRestartDaemon();
    setProtocolUpdate({ required: false, activeSessions: 0 });
  }, [platform]);

  useEffect(() => {
    if (platform.kind !== 'electron') return;

    const unsubDisconnect = platform.orca.lifecycle.onDaemonDisconnected(() => {
      if (!disconnectToastId.current) {
        disconnectToastId.current = addToast({
          message: 'Connection to terminal daemon lost. Reconnecting...',
          type: 'warning',
        });
      }
    });

    const unsubReconnect = platform.orca.lifecycle.onDaemonReconnected(() => {
      if (disconnectToastId.current) {
        removeToast(disconnectToastId.current);
        disconnectToastId.current = null;
      }
      addToast({
        message: 'Reconnected to terminal daemon',
        type: 'info',
        autoDismissMs: 5000,
      });
    });

    const unsubInterrupted = platform.orca.lifecycle.onInterruptedSessions((count) => {
      addToast({
        message: `Reconnected to ${count} running session${count === 1 ? '' : 's'} from previous launch`,
        type: 'info',
        autoDismissMs: 8000,
      });
    });

    const unsubProtocol = platform.orca.lifecycle.onProtocolUpdateRequired((activeSessions) => {
      setProtocolUpdate({ required: true, activeSessions });
    });

    return () => {
      unsubDisconnect();
      unsubReconnect();
      unsubInterrupted();
      unsubProtocol();
    };
  }, [platform, addToast, removeToast]);

  return { protocolUpdate, confirmProtocolUpdate };
}
