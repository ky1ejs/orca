import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery } from 'urql';
import type { WorkspaceRole } from '../graphql/__generated__/generated.js';
import { WorkspacesQueryDocument } from '../graphql/queries.js';

const STORAGE_KEY = 'orca:activeWorkspaceSlug';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceContextValue {
  currentWorkspace: Workspace | null;
  currentRole: WorkspaceRole | null;
  workspaces: Workspace[];
  switchWorkspace: (slug: string) => void;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [result] = useQuery({ query: WorkspacesQueryDocument });
  const [activeSlug, setActiveSlug] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const workspaces: Workspace[] = useMemo(() => result.data?.workspaces ?? [], [result.data]);

  const currentWorkspace = workspaces.find((w) => w.slug === activeSlug) ?? workspaces[0] ?? null;
  const currentRole = currentWorkspace?.role ?? null;

  // Sync activeSlug when workspaces load and stored slug is stale
  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.find((w) => w.slug === activeSlug)) {
      setActiveSlug(workspaces[0].slug);
    }
  }, [workspaces, activeSlug]);

  // Persist active slug
  useEffect(() => {
    if (currentWorkspace) {
      try {
        localStorage.setItem(STORAGE_KEY, currentWorkspace.slug);
      } catch {
        // ignore
      }
    }
  }, [currentWorkspace]);

  const switchWorkspace = useCallback((slug: string) => {
    setActiveSlug(slug);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        currentRole,
        workspaces,
        switchWorkspace,
        loading: result.fetching,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
