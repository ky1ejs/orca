import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ViewType = 'projects' | 'project' | 'task';

export interface NavigationState {
  view: ViewType;
  id?: string;
}

interface NavigationContextValue {
  current: NavigationState;
  navigate: (state: NavigationState) => void;
  goBack: () => void;
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

  const canGoBack = stack.length > 1;

  return (
    <NavigationContext.Provider value={{ current, navigate, goBack, canGoBack }}>
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
