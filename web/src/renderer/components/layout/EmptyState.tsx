import type { ReactNode } from 'react';
import { Folder, ClipboardList, SquareTerminal } from 'lucide-react';
import { iconSize, iconStroke } from '../../tokens/icon-size.js';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      data-testid="empty-state"
    >
      {icon && <div className="mb-4 text-fg-faint">{icon}</div>}
      <h3 className="text-heading-sm font-medium text-fg-muted mb-2">{title}</h3>
      <p className="text-body-sm text-fg-faint max-w-md mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export function EmptyProjectList({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <EmptyState
      icon={<Folder className={iconSize.lg} strokeWidth={iconStroke.lg} />}
      title="No projects yet"
      description="Projects help you organize tasks for your AI agents. Create your first project to get started."
      action={
        <button
          onClick={onCreateProject}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors font-medium"
          data-testid="create-first-project"
        >
          Create Your First Project
        </button>
      }
    />
  );
}

export function EmptyTaskList({ onCreateTask }: { onCreateTask: () => void }) {
  return (
    <EmptyState
      icon={<ClipboardList className={iconSize.lg} strokeWidth={iconStroke.lg} />}
      title="No tasks yet"
      description="Tasks represent work items for AI agents. Each task has a working directory where the agent will operate."
      action={
        <button
          onClick={onCreateTask}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors font-medium"
          data-testid="create-first-task"
        >
          Create Your First Task
        </button>
      }
    />
  );
}

export function EmptyTerminalArea() {
  return (
    <EmptyState
      icon={<SquareTerminal className={iconSize.lg} strokeWidth={iconStroke.lg} />}
      title="No active terminals"
      description="Open a terminal on a task to see its output here."
    />
  );
}
