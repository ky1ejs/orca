import { useState } from 'react';
import { TaskStatusBadge } from './TaskStatusBadge.js';
import { useCreateTask } from '../../hooks/useGraphQL.js';
import { EmptyTaskList } from '../layout/EmptyState.js';
import type { TaskStatus } from '../../graphql/__generated__/generated.js';

interface TaskSummary {
  id: string;
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
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');

  const handleCreate = async () => {
    if (!title.trim() || !workingDirectory.trim()) return;
    await createTask({
      title: title.trim(),
      projectId,
      workingDirectory: workingDirectory.trim(),
    });
    setTitle('');
    setWorkingDirectory('');
    setShowCreate(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Tasks</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
        >
          {showCreate ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <input
              type="text"
              placeholder="Working directory (e.g., /path/to/project)"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCreate}
              disabled={!title.trim() || !workingDirectory.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-md transition-colors"
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
              className="w-full text-left p-3 bg-gray-900 hover:bg-gray-800 rounded-lg border border-gray-800 flex items-center justify-between transition-colors"
            >
              <span className="text-white text-sm">{task.title}</span>
              <TaskStatusBadge status={task.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
