import { createContext, useContext, useReducer, useCallback, useMemo, type ReactNode } from 'react';

type ViewType =
  | 'initiatives'
  | 'initiative'
  | 'projects'
  | 'project'
  | 'task'
  | 'my-tasks'
  | 'members'
  | 'invitations'
  | 'settings';

interface NavigationState {
  view: ViewType;
  id?: string;
  projectId?: string;
  projectName?: string;
  taskName?: string;
  fromView?: 'my-tasks';
}

interface NavigationContextValue {
  current: NavigationState;
  navigate: (state: NavigationState) => void;
  goToParent: () => void;
  canGoToParent: boolean;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
}

const MAX_HISTORY = 50;

interface HistoryState {
  entries: NavigationState[];
  index: number;
}

type HistoryAction =
  | { type: 'navigate'; state: NavigationState }
  | { type: 'go_back' }
  | { type: 'go_forward' }
  | { type: 'go_to_parent' };

function isSameEntry(a: NavigationState, b: NavigationState): boolean {
  return a.view === b.view && a.id === b.id;
}

function computeParent(current: NavigationState): NavigationState | null {
  switch (current.view) {
    case 'task':
      if (current.fromView === 'my-tasks') {
        return { view: 'my-tasks' };
      }
      return current.projectId
        ? { view: 'project', id: current.projectId, projectName: current.projectName }
        : { view: 'initiatives' };
    case 'project':
      return { view: 'initiatives' };
    case 'initiative':
      return { view: 'initiatives' };
    default:
      return null;
  }
}

function pushEntry(state: HistoryState, entry: NavigationState): HistoryState {
  const current = state.entries[state.index];
  if (isSameEntry(current, entry)) return state;

  const truncated = state.entries.slice(0, state.index + 1);
  truncated.push(entry);

  // Cap history length, shifting oldest entries off
  if (truncated.length > MAX_HISTORY) {
    return { entries: truncated.slice(truncated.length - MAX_HISTORY), index: MAX_HISTORY - 1 };
  }
  return { entries: truncated, index: truncated.length - 1 };
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'navigate':
      return pushEntry(state, action.state);

    case 'go_back':
      if (state.index <= 0) return state;
      return { ...state, index: state.index - 1 };

    case 'go_forward':
      if (state.index >= state.entries.length - 1) return state;
      return { ...state, index: state.index + 1 };

    case 'go_to_parent': {
      const parent = computeParent(state.entries[state.index]);
      if (!parent) return state;
      return pushEntry(state, parent);
    }
  }
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [history, dispatch] = useReducer(historyReducer, {
    entries: [{ view: 'initiatives' }],
    index: 0,
  });

  const current = history.entries[history.index];

  const navigate = useCallback((state: NavigationState) => {
    if (import.meta.env.DEV && state.view === 'task' && !state.projectId) {
      console.warn(
        '[Navigation] Navigating to task without projectId — breadcrumbs will be incomplete',
      );
    }
    dispatch({ type: 'navigate', state });
  }, []);

  const goToParent = useCallback(() => {
    dispatch({ type: 'go_to_parent' });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: 'go_back' });
  }, []);

  const goForward = useCallback(() => {
    dispatch({ type: 'go_forward' });
  }, []);

  const canGoToParent =
    current.view === 'project' || current.view === 'task' || current.view === 'initiative';
  const canGoBack = history.index > 0;
  const canGoForward = history.index < history.entries.length - 1;

  const value = useMemo(
    () => ({
      current,
      navigate,
      goToParent,
      canGoToParent,
      goBack,
      goForward,
      canGoBack,
      canGoForward,
    }),
    [current, navigate, goToParent, canGoToParent, goBack, goForward, canGoBack, canGoForward],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}
