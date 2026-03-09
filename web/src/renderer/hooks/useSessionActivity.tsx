import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type SessionActivitySet = Set<string>;

const SessionActivityContext = createContext<SessionActivitySet>(new Set());

export function SessionActivityProvider({ children }: { children: ReactNode }) {
  const [activeIds, setActiveIds] = useState<SessionActivitySet>(new Set());

  useEffect(() => {
    if (!window.orca?.lifecycle?.onSessionActivityChanged) return;

    return window.orca.lifecycle.onSessionActivityChanged((sessionId, active) => {
      setActiveIds((prev) => {
        if (active && prev.has(sessionId)) return prev;
        if (!active && !prev.has(sessionId)) return prev;
        const next = new Set(prev);
        if (active) {
          next.add(sessionId);
        } else {
          next.delete(sessionId);
        }
        return next;
      });
    });
  }, []);

  return (
    <SessionActivityContext.Provider value={activeIds}>{children}</SessionActivityContext.Provider>
  );
}

/** Returns a Set of session IDs that have recent PTY output activity. */
export function useSessionActivity(): SessionActivitySet {
  return useContext(SessionActivityContext);
}
