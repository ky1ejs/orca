import { useState, useEffect, useRef } from 'react';
import { SessionStatus, isActiveSessionStatus } from '../../../shared/session-status.js';
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useTaskSubscription,
  useWorkspaceBySlug,
  useWorkspaceMembers,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { useProjectDirectory } from '../../hooks/useProjectDirectory.js';
import { TaskStatusBadge } from './TaskStatusBadge.js';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer.js';
import { AgentStatus } from '../terminal/AgentStatus.js';
import { useTerminalSessions } from '../../hooks/useTerminalSessions.js';
import { useSessionActivity } from '../../hooks/useSessionActivity.js';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import { TaskDetailSkeleton } from '../layout/Skeleton.js';
import { LabelBadge } from '../labels/LabelBadge.js';
import { LabelPicker } from '../labels/LabelPicker.js';

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
  const { navigateBack } = useNavigation();
  const { currentWorkspace } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.Todo);
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.None);
  const [editingDirectory, setEditingDirectory] = useState('');
  const [isEditingDir, setIsEditingDir] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
  const launchMenuRef = useRef<HTMLDivElement>(null);
  const [agentError, setAgentError] = useState<{
    message: string;
    suggestion: string;
  } | null>(null);
  const { sessions, refresh: refreshSessions } = useTerminalSessions(taskId);
  const activeSessionIds = useSessionActivity();
  const {
    directory: projectDirectory,
    loading: dirLoading,
    updateDirectory,
  } = useProjectDirectory(data?.task?.projectId);

  const { data: workspaceData } = useWorkspaceBySlug(currentWorkspace?.slug ?? '');
  const workspaceProjects = workspaceData?.workspace?.projects ?? [];
  const { data: membersData } = useWorkspaceMembers(currentWorkspace?.slug ?? '');
  const workspaceMembers = membersData?.workspace?.members ?? [];

  useTaskSubscription(currentWorkspace?.id ?? '');

  useEffect(() => {
    if (!launchMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (launchMenuRef.current && !launchMenuRef.current.contains(e.target as Node)) {
        setLaunchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [launchMenuOpen]);

  if (fetching && !data) {
    return <TaskDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-error">
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

  const activeSession = sessions.find((s) => isActiveSessionStatus(s.status));
  const errorSession = sessions.find((s) => s.status === SessionStatus.Error);

  const startEditing = () => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status);
    setPriority(task.priority);
    setEditing(true);
  };

  const handleStopAgent = async () => {
    if (!activeSession) return;
    await window.orca.agent.stop(activeSession.id);
    refreshSessions();
  };

  const handleSave = async () => {
    if (status === TaskStatus.Done && activeSession) {
      await window.orca.agent.stop(activeSession.id);
      refreshSessions();
    }
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
    if (task.projectId) {
      navigateBack({ view: 'project', id: task.projectId });
    } else {
      navigateBack({ view: 'projects' });
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === TaskStatus.Done && activeSession) {
      await window.orca.agent.stop(activeSession.id);
      refreshSessions();
    }
    await updateTask(taskId, { status: newStatus });
  };

  const handleLaunchAgent = async (options?: { planMode?: boolean }) => {
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
    const result = await window.orca.agent.launch(taskId, projectDirectory, options);
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
          className="px-3 py-1.5 bg-gray-700 text-gray-400 text-label-md rounded-md cursor-not-allowed"
          data-testid="agent-button"
        >
          Opening...
        </button>
      );
    }

    if (activeSession) {
      return (
        <div className="flex gap-2">
          <button
            disabled
            className="px-3 py-1.5 bg-gray-700 text-gray-400 text-label-md rounded-md cursor-not-allowed"
            data-testid="agent-button"
          >
            Running...
          </button>
          <button
            onClick={handleStopAgent}
            className="px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors"
            data-testid="close-terminal-button"
          >
            Close Terminal
          </button>
        </div>
      );
    }

    if (errorSession) {
      return (
        <button
          onClick={handleRestartAgent}
          className="px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors"
          data-testid="agent-button"
        >
          Restart Terminal
        </button>
      );
    }

    return (
      <div className="relative" ref={launchMenuRef}>
        <div className="flex">
          <button
            onClick={() => handleLaunchAgent()}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-l-md transition-colors"
            data-testid="agent-button"
          >
            Open Terminal
          </button>
          <button
            onClick={() => setLaunchMenuOpen((prev) => !prev)}
            className="px-1.5 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-r-md border-l border-accent-active transition-colors"
            data-testid="agent-menu-toggle"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 5l3 3 3-3H3z" />
            </svg>
          </button>
        </div>
        {launchMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10 min-w-[160px]">
            <button
              onClick={() => {
                setLaunchMenuOpen(false);
                handleLaunchAgent();
              }}
              className="w-full text-left px-3 py-2 text-body-sm text-white hover:bg-gray-700 rounded-t-md transition-colors"
              data-testid="launch-terminal"
            >
              Open Terminal
            </button>
            <button
              onClick={() => {
                setLaunchMenuOpen(false);
                handleLaunchAgent({ planMode: true });
              }}
              className="w-full text-left px-3 py-2 text-body-sm text-white hover:bg-gray-700 rounded-b-md transition-colors"
              data-testid="launch-plan-mode"
            >
              Open in Plan Mode
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <button
        onClick={() =>
          task.projectId
            ? navigateBack({ view: 'project', id: task.projectId })
            : navigateBack({ view: 'projects' })
        }
        className="text-gray-400 hover:text-white text-label-md mb-4 inline-flex items-center transition-colors"
      >
        &larr; Back to {task.project?.name ?? 'Projects'}
      </button>

      {editing ? (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-body-sm focus:outline-none focus:border-gray-500"
              autoFocus
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (supports Markdown)"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-body-sm focus:outline-none focus:border-gray-500 resize-none"
              rows={6}
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-body-sm focus:outline-none focus:border-gray-500"
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
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-body-sm focus:outline-none focus:border-gray-500"
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
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-label-md rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <span className="text-gray-500 text-heading-sm font-mono mr-3">{task.displayId}</span>
              <h1 className="text-heading-lg font-bold text-white">{task.title}</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={startEditing}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-label-md rounded-md transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-gray-500 text-label-md">Status:</span>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-body-sm focus:outline-none focus:border-gray-500"
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
              <span className="text-gray-500 text-label-md">Priority:</span>
              <select
                value={task.priority}
                onChange={(e) => updateTask(taskId, { priority: e.target.value as TaskPriority })}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-body-sm focus:outline-none focus:border-gray-500"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-gray-500 text-label-md">Project:</span>
              <select
                value={task.projectId ?? ''}
                onChange={(e) => updateTask(taskId, { projectId: e.target.value || null })}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-body-sm focus:outline-none focus:border-gray-500"
              >
                <option value="">Inbox (no project)</option>
                {workspaceProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-gray-500 text-label-md">Assignee:</span>
              <select
                value={task.assignee?.id ?? ''}
                onChange={(e) => updateTask(taskId, { assigneeId: e.target.value || null })}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-body-sm focus:outline-none focus:border-gray-500"
                data-testid="assignee-select"
              >
                <option value="">Unassigned</option>
                {workspaceMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-gray-500 text-label-md">Labels:</span>
              <div className="flex items-center gap-1 flex-wrap">
                {task.labels.map((label) => (
                  <LabelBadge
                    key={label.id}
                    name={label.name}
                    color={label.color}
                    onRemove={() =>
                      updateTask(taskId, {
                        labelIds: task.labels.filter((l) => l.id !== label.id).map((l) => l.id),
                      })
                    }
                  />
                ))}
                {currentWorkspace && (
                  <LabelPicker
                    workspaceId={currentWorkspace.id}
                    selectedLabelIds={task.labels.map((l) => l.id)}
                    onChange={(labelIds) => updateTask(taskId, { labelIds })}
                  />
                )}
              </div>
            </div>

            <div>
              <span className="text-gray-500 text-label-md">Project Directory:</span>
              {dirLoading ? (
                <p className="text-gray-500 text-body-sm mt-1">Loading...</p>
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
                    className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-body-sm font-mono focus:outline-none focus:border-gray-500"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      updateDirectory(editingDirectory.trim());
                      setIsEditingDir(false);
                    }}
                    className="px-2 py-1 bg-accent hover:bg-accent-hover text-on-accent text-label-sm rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingDir(false)}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-label-sm rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : projectDirectory ? (
                <p
                  className="text-gray-300 text-body-sm font-mono mt-1 cursor-pointer hover:text-gray-200 transition-colors"
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
                  className="text-gray-300 hover:text-gray-200 text-label-md mt-1 transition-colors"
                >
                  Set project directory...
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-label-md">Terminal:</span>
              {renderAgentButton()}
              {activeSession && (
                <AgentStatus
                  status={activeSession.status}
                  active={activeSessionIds.has(activeSession.id)}
                />
              )}
            </div>

            {agentError && (
              <div
                className="p-3 bg-error-muted border border-error-strong rounded-md"
                data-testid="agent-error"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-error text-body-sm">{agentError.message}</p>
                    <p className="text-error/70 text-label-sm mt-1">{agentError.suggestion}</p>
                  </div>
                  <button
                    onClick={() => setAgentError(null)}
                    className="text-error hover:text-error text-label-md ml-2"
                    data-testid="dismiss-error"
                  >
                    &times;
                  </button>
                </div>
              </div>
            )}

            {task.description && (
              <div>
                <span className="text-gray-500 text-label-md block mb-2">Description:</span>
                <MarkdownRenderer content={task.description} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
