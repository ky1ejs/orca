import { useState } from 'react';
import { SessionStatus, isActiveSessionStatus } from '../../../shared/session-status.js';
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useTaskSubscription,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { useProjectDirectory } from '../../hooks/useProjectDirectory.js';
import { TaskStatusBadge } from './TaskStatusBadge.js';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer.js';
import { AgentStatus } from '../terminal/AgentStatus.js';
import { useTerminalSessions } from '../../hooks/useTerminalSessions.js';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import { TaskDetailSkeleton } from '../layout/Skeleton.js';

interface TaskDetailProps {
  taskId: string;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: TaskStatus.Todo, label: 'Todo' },
  { value: TaskStatus.InProgress, label: 'In Progress' },
  { value: TaskStatus.InReview, label: 'In Review' },
  { value: TaskStatus.Done, label: 'Done' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: TaskPriority.None, label: 'None' },
  { value: TaskPriority.Low, label: 'Low' },
  { value: TaskPriority.Medium, label: 'Medium' },
  { value: TaskPriority.High, label: 'High' },
  { value: TaskPriority.Urgent, label: 'Urgent' },
];

export function TaskDetail({ taskId }: TaskDetailProps) {
  const { data, fetching, error } = useTask(taskId);
  const { updateTask } = useUpdateTask();
  const { deleteTask } = useDeleteTask();
  const { goBack, navigate } = useNavigation();
  const { currentWorkspace } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.Todo);
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.None);
  const [editingDirectory, setEditingDirectory] = useState('');
  const [isEditingDir, setIsEditingDir] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [agentError, setAgentError] = useState<{
    message: string;
    suggestion: string;
  } | null>(null);
  const { sessions, refresh: refreshSessions } = useTerminalSessions(taskId);
  const {
    directory: projectDirectory,
    loading: dirLoading,
    updateDirectory,
  } = useProjectDirectory(data?.task?.projectId);

  useTaskSubscription(currentWorkspace?.id ?? '');

  if (fetching && !data) {
    return <TaskDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-red-400">
        <p>Error loading task: {error.message}</p>
      </div>
    );
  }

  const task = data?.task;

  if (!task) {
    return (
      <div className="p-6 text-gray-400">
        <p>Task not found.</p>
      </div>
    );
  }

  const startEditing = () => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status);
    setPriority(task.priority);
    setEditing(true);
  };

  const handleSave = async () => {
    await updateTask(taskId, {
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      status,
      priority,
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    await deleteTask(taskId);
    goBack();
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    await updateTask(taskId, { status: newStatus });
  };

  const activeSession = sessions.find((s) => isActiveSessionStatus(s.status));
  const errorSession = sessions.find((s) => s.status === SessionStatus.Error);

  const handleLaunchAgent = async () => {
    if (!projectDirectory) {
      setAgentError({
        message: 'No project directory set.',
        suggestion:
          'Click "Set project directory..." above to set the local path before launching an agent.',
      });
      return;
    }
    setLaunching(true);
    setAgentError(null);
    const result = await window.orca.agent.launch(taskId, projectDirectory);
    if (!result.success && result.error) {
      setAgentError({ message: result.error.message, suggestion: result.error.suggestion });
    }
    refreshSessions();
    setLaunching(false);
  };

  const handleRestartAgent = async () => {
    if (!errorSession) return;
    if (!projectDirectory) {
      setAgentError({
        message: 'No project directory set.',
        suggestion:
          'Click "Set project directory..." above to set the local path before restarting an agent.',
      });
      return;
    }
    setLaunching(true);
    setAgentError(null);
    const result = await window.orca.agent.restart(taskId, errorSession.id, projectDirectory);
    if (!result.success && result.error) {
      setAgentError({ message: result.error.message, suggestion: result.error.suggestion });
    }
    refreshSessions();
    setLaunching(false);
  };

  const renderAgentButton = () => {
    if (launching) {
      return (
        <button
          disabled
          className="px-3 py-1.5 bg-gray-700 text-gray-400 text-sm rounded-md cursor-not-allowed"
          data-testid="agent-button"
        >
          Opening...
        </button>
      );
    }

    if (activeSession) {
      return (
        <button
          disabled
          className="px-3 py-1.5 bg-gray-700 text-gray-400 text-sm rounded-md cursor-not-allowed"
          data-testid="agent-button"
        >
          Running...
        </button>
      );
    }

    if (errorSession) {
      return (
        <button
          onClick={handleRestartAgent}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm rounded-md transition-colors"
          data-testid="agent-button"
        >
          Restart Terminal
        </button>
      );
    }

    return (
      <button
        onClick={handleLaunchAgent}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
        data-testid="agent-button"
      >
        Open Terminal
      </button>
    );
  };

  return (
    <div className="p-6">
      <button
        onClick={goBack}
        className="text-gray-400 hover:text-white text-sm mb-4 inline-flex items-center transition-colors"
      >
        &larr; Back
      </button>

      <div className="mb-2">
        <button
          onClick={() => navigate({ view: 'project', id: task.projectId })}
          className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
        >
          {task.project.name}
        </button>
      </div>

      {editing ? (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (supports Markdown)"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
              rows={6}
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">{task.title}</h1>
            <div className="flex gap-2">
              <button
                onClick={startEditing}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-300 text-sm rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-gray-500 text-sm">Status:</span>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <TaskStatusBadge status={task.status} />
            </div>

            <div className="flex items-center gap-4">
              <span className="text-gray-500 text-sm">Priority:</span>
              <select
                value={task.priority}
                onChange={(e) => updateTask(taskId, { priority: e.target.value as TaskPriority })}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-gray-500 text-sm">Project Directory:</span>
              {dirLoading ? (
                <p className="text-gray-500 text-sm mt-1">Loading...</p>
              ) : isEditingDir ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={editingDirectory}
                    onChange={(e) => setEditingDirectory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateDirectory(editingDirectory.trim());
                        setIsEditingDir(false);
                      } else if (e.key === 'Escape') {
                        setIsEditingDir(false);
                      }
                    }}
                    className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm font-mono focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      updateDirectory(editingDirectory.trim());
                      setIsEditingDir(false);
                    }}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingDir(false)}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : projectDirectory ? (
                <p
                  className="text-gray-300 text-sm font-mono mt-1 cursor-pointer hover:text-blue-400 transition-colors"
                  onClick={() => {
                    setEditingDirectory(projectDirectory);
                    setIsEditingDir(true);
                  }}
                >
                  {projectDirectory}
                </p>
              ) : (
                <button
                  onClick={() => {
                    setEditingDirectory('');
                    setIsEditingDir(true);
                  }}
                  className="text-blue-400 hover:text-blue-300 text-sm mt-1 transition-colors"
                >
                  Set project directory...
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-sm">Terminal:</span>
              {renderAgentButton()}
              {activeSession && <AgentStatus status={activeSession.status} />}
            </div>

            {agentError && (
              <div
                className="p-3 bg-red-900/30 border border-red-800 rounded-md"
                data-testid="agent-error"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-red-300 text-sm">{agentError.message}</p>
                    <p className="text-red-400/70 text-xs mt-1">{agentError.suggestion}</p>
                  </div>
                  <button
                    onClick={() => setAgentError(null)}
                    className="text-red-400 hover:text-red-300 text-sm ml-2"
                    data-testid="dismiss-error"
                  >
                    &times;
                  </button>
                </div>
              </div>
            )}

            {task.description && (
              <div>
                <span className="text-gray-500 text-sm block mb-2">Description:</span>
                <MarkdownRenderer content={task.description} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
