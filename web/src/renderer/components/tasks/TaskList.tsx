import { useState } from 'react';
import { TaskStatusBadge } from './TaskStatusBadge.js';
import { TaskBranchBadge } from './TaskBranchBadge.js';
import { useCreateTask } from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';
import { EmptyTaskList } from '../layout/EmptyState.js';
import type { TaskStatus } from '../../graphql/__generated__/generated.js';

interface TaskSummary {
  id: string;
  displayId: string;
  title: string;
  status: TaskStatus;
}

interface TaskListProps {
  projectId: string;
  tasks: TaskSummary[];
  onTaskClick: (taskId: string) => void;
}

export function TaskList({ projectId, tasks, onTaskClick }: TaskListProps) {
  const { createTask } = useCreateTask();
  const { currentWorkspace } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');

  const handleCreate = async () => {
    if (!title.trim() || !currentWorkspace) return;
    await createTask({
      title: title.trim(),
      projectId,
      workspaceId: currentWorkspace.id,
    });
    setTitle('');
    setShowCreate(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-heading-sm font-semibold text-fg">Tasks</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors"
        >
          {showCreate ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 p-4 bg-surface-raised rounded-lg border border-edge">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg placeholder-fg-faint text-body-sm focus:outline-none focus:border-edge-subtle"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-surface-hover disabled:text-fg-faint text-on-accent text-label-md rounded-md transition-colors"
            >
              Create Task
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !showCreate ? (
        <EmptyTaskList onCreateTask={() => setShowCreate(true)} />
      ) : tasks.length === 0 ? null : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => onTaskClick(task.id)}
              className="w-full text-left p-3 bg-surface-raised hover:bg-surface-hover rounded-lg border border-edge flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="text-fg-faint text-code-sm font-mono">{task.displayId}</span>
                <span className="text-fg text-body-sm">{task.title}</span>
              </span>
              <TaskBranchBadge taskId={task.id} />
              <TaskStatusBadge status={task.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
