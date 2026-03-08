import { useEffect, useRef } from 'react';
import { useToast } from '../components/toast/ToastProvider.js';

/**
 * Listens to daemon lifecycle events and shows toasts for
 * disconnect/reconnect/interrupted sessions.
 */
export function useDaemonLifecycle(): void {
  const { addToast, removeToast } = useToast();
  const disconnectToastId = useRef<string | null>(null);

  useEffect(() => {
    if (!window.orca?.lifecycle) return;

    const unsubDisconnect = window.orca.lifecycle.onDaemonDisconnected(() => {
      if (!disconnectToastId.current) {
        disconnectToastId.current = addToast({
          message: 'Connection to terminal daemon lost. Reconnecting...',
          type: 'warning',
        });
      }
    });

    const unsubReconnect = window.orca.lifecycle.onDaemonReconnected(() => {
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

    const unsubInterrupted = window.orca.lifecycle.onInterruptedSessions((count) => {
      addToast({
        message: `Reconnected to ${count} running session${count === 1 ? '' : 's'} from previous launch`,
        type: 'info',
        autoDismissMs: 8000,
      });
    });

    return () => {
      unsubDisconnect();
      unsubReconnect();
      unsubInterrupted();
    };
  }, [addToast, removeToast]);
}
