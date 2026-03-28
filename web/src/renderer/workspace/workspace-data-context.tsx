import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useWorkspaceBySlug,
  useInitiativeSubscription,
  useProjectSubscription,
  useTaskSubscription,
} from '../hooks/useGraphQL.js';
import { useWorkspace } from './context.js';
import type { WorkspaceQuery } from '../graphql/__generated__/generated.js';

type WorkspaceData = NonNullable<WorkspaceQuery['workspace']>;

interface WorkspaceDataContextValue {
  workspace: WorkspaceData | undefined;
  projects: WorkspaceData['projects'];
  initiatives: WorkspaceData['initiatives'];
  inboxTasks: WorkspaceData['tasks'];
  fetching: boolean;
  refetch: ReturnType<typeof useWorkspaceBySlug>['refetch'];
}

const EMPTY_PROJECTS: WorkspaceData['projects'] = [];
const EMPTY_INITIATIVES: WorkspaceData['initiatives'] = [];
const EMPTY_TASKS: WorkspaceData['tasks'] = [];

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | null>(null);

export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug ?? '';
  const { data, fetching, refetch } = useWorkspaceBySlug(slug);

  // Centralise subscriptions so they run exactly once per workspace
  useInitiativeSubscription(currentWorkspace?.id ?? '');
  useProjectSubscription(currentWorkspace?.id ?? '');
  useTaskSubscription(currentWorkspace?.id ?? '');

  const workspace = data?.workspace ?? undefined;

  const value = useMemo(
    () => ({
      workspace,
      projects: workspace?.projects ?? EMPTY_PROJECTS,
      initiatives: workspace?.initiatives ?? EMPTY_INITIATIVES,
      inboxTasks: workspace?.tasks ?? EMPTY_TASKS,
      fetching,
      refetch,
    }),
    [workspace, fetching, refetch],
  );

  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
}

export function useWorkspaceData(): WorkspaceDataContextValue {
  const ctx = useContext(WorkspaceDataContext);
  if (!ctx) {
    throw new Error('useWorkspaceData must be used within a WorkspaceDataProvider');
  }
  return ctx;
}
