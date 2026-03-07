import { useEffect, useRef, useCallback, useState } from 'react';

export function useTerminal(sessionId: string | null) {
  const [isConnected, setIsConnected] = useState(sessionId !== null);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    setIsConnected(sessionId !== null);

    if (!sessionId) return;

    const unsubExit = window.orca.pty.onExit(sessionId, () => {
      setIsConnected(false);
    });
    unsubscribersRef.current.push(unsubExit);

    return () => {
      for (const unsub of unsubscribersRef.current) {
        unsub();
      }
      unsubscribersRef.current = [];
    };
  }, [sessionId]);

  const write = useCallback(
    (data: string) => {
      if (sessionId) window.orca.pty.write(sessionId, data);
    },
    [sessionId],
  );

  const resize = useCallback(
    (cols: number, rows: number) => {
      if (sessionId) window.orca.pty.resize(sessionId, cols, rows);
    },
    [sessionId],
  );

  const kill = useCallback(() => {
    if (sessionId) window.orca.pty.kill(sessionId);
  }, [sessionId]);

  const replay = useCallback(() => {
    if (sessionId) return window.orca.pty.replay(sessionId);
    return Promise.resolve('');
  }, [sessionId]);

  const onData = useCallback(
    (cb: (data: string) => void) => {
      if (!sessionId) return () => {};
      return window.orca.pty.onData(sessionId, cb);
    },
    [sessionId],
  );

  const onExit = useCallback(
    (cb: (exitCode: number) => void) => {
      if (!sessionId) return () => {};
      return window.orca.pty.onExit(sessionId, cb);
    },
    [sessionId],
  );

  return { isConnected, write, resize, kill, replay, onData, onExit };
}
