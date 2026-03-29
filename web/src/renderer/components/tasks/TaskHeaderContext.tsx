import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { TerminalSessionInfo } from '../../hooks/useTerminalSessions.js';

interface TaskHeaderControls {
  displayId: string;
  taskId: string;
  activeSession: TerminalSessionInfo | undefined;
  errorSession: TerminalSessionInfo | undefined;
  projectDirectory: string | null;
  refreshSessions: () => void;
  buildMetadata: () => {
    displayId: string;
    title: string;
    description: string | null;
    projectName: string | null;
    workspaceSlug: string;
  };
  onAgentError: (error: { message: string; suggestion: string } | null) => void;
}

type SetTaskHeaderControls = Dispatch<SetStateAction<TaskHeaderControls | null>>;

interface TaskHeaderContextValue {
  controls: TaskHeaderControls | null;
  setControls: SetTaskHeaderControls;
}

const TaskHeaderContext = createContext<TaskHeaderContextValue | null>(null);

export function TaskHeaderProvider({ children }: { children: ReactNode }) {
  const [controls, setControls] = useState<TaskHeaderControls | null>(null);
  const value = useMemo(() => ({ controls, setControls }), [controls]);
  return (
    <TaskHeaderContext.Provider value={value}>{children}</TaskHeaderContext.Provider>
  );
}

export function useTaskHeaderControls(): TaskHeaderControls | null {
  const ctx = useContext(TaskHeaderContext);
  return ctx?.controls ?? null;
}

export function useSetTaskHeaderControls(): SetTaskHeaderControls {
  const ctx = useContext(TaskHeaderContext);
  if (!ctx) {
    throw new Error('useSetTaskHeaderControls must be used within a TaskHeaderProvider');
  }
  return ctx.setControls;
}
