import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

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
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [current, setCurrent] = useState<NavigationState>({ view: 'initiatives' });

  const navigate = useCallback((state: NavigationState) => {
    if (import.meta.env.DEV && state.view === 'task' && !state.projectId) {
      console.warn(
        '[Navigation] Navigating to task without projectId — breadcrumbs will be incomplete',
      );
    }
    setCurrent(state);
  }, []);

  const goToParent = useCallback(() => {
    setCurrent((prev) => {
      switch (prev.view) {
        case 'task':
          if (prev.fromView === 'my-tasks') {
            return { view: 'my-tasks' as const };
          }
          return prev.projectId
            ? { view: 'project' as const, id: prev.projectId, projectName: prev.projectName }
            : { view: 'initiatives' as const };
        case 'project':
          return { view: 'initiatives' as const };
        case 'initiative':
          return { view: 'initiatives' as const };
        default:
          return prev;
      }
    });
  }, []);

  const canGoToParent =
    current.view === 'project' || current.view === 'task' || current.view === 'initiative';

  const value = useMemo(
    () => ({ current, navigate, goToParent, canGoToParent }),
    [current, navigate, goToParent, canGoToParent],
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
