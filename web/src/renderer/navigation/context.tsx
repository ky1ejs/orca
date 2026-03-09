import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ViewType = 'projects' | 'project' | 'task' | 'members' | 'invitations' | 'settings';

interface NavigationState {
  view: ViewType;
  id?: string;
}

interface NavigationContextValue {
  current: NavigationState;
  navigate: (state: NavigationState) => void;
  goBack: () => void;
  navigateBack: (target: NavigationState) => void;
  canGoBack: boolean;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [stack, setStack] = useState<NavigationState[]>([{ view: 'projects' }]);

  const current = stack[stack.length - 1];

  const navigate = useCallback((state: NavigationState) => {
    setStack((prev) => [...prev, state]);
  }, []);

  const goBack = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const navigateBack = useCallback((target: NavigationState) => {
    setStack((prev) => {
      for (let i = prev.length - 2; i >= 0; i--) {
        if (prev[i].view === target.view && prev[i].id === target.id) {
          return prev.slice(0, i + 1);
        }
      }
      return target.view === 'projects'
        ? [{ view: 'projects' as const }]
        : [{ view: 'projects' as const }, target];
    });
  }, []);

  const canGoBack = stack.length > 1;

  return (
    <NavigationContext.Provider value={{ current, navigate, goBack, navigateBack, canGoBack }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}
