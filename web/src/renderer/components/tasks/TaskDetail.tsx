import { useState, useEffect, useRef } from 'react';
import {
  Pencil,
  Archive,
  SquareTerminal,
  RotateCcw,
  FolderOpen,
  X,
  ChevronDown,
} from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { SessionStatus, isActiveSessionStatus } from '../../../shared/session-status.js';
import {
  useTask,
  useUpdateTask,
  useArchiveTask,
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
import { PullRequestList } from './PullRequestList.js';

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
  const { archiveTask } = useArchiveTask();
  const { goToParent } = useNavigation();
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
      <div className="p-6 text-fg-muted">
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

  const handleArchive = async () => {
    await archiveTask(taskId);
    goToParent();
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === TaskStatus.Done && activeSession) {
      await window.orca.agent.stop(activeSession.id);
      refreshSessions();
    }
    await updateTask(taskId, { status: newStatus });
  };

  const buildMetadata = () => ({
    displayId: task.displayId,
    title: task.title,
    description: task.description ?? null,
    projectName: task.project?.name ?? null,
    workspaceSlug: currentWorkspace?.slug ?? '',
  });

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
    const result = await window.orca.agent.launch(
      taskId,
      projectDirectory,
      options,
      buildMetadata(),
    );
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
    const result = await window.orca.agent.restart(
      taskId,
      errorSession.id,
      projectDirectory,
      undefined,
      buildMetadata(),
    );
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
          className="px-3 py-1.5 bg-surface-hover text-fg-muted text-label-md rounded-md cursor-not-allowed"
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
            className="px-3 py-1.5 bg-surface-hover text-fg-muted text-label-md rounded-md cursor-not-allowed"
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
          className="px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors inline-flex items-center"
          data-testid="agent-button"
        >
          <RotateCcw className={`${iconSize.sm} mr-1`} />
          Restart Terminal
        </button>
      );
    }

    return (
      <div className="relative" ref={launchMenuRef}>
        <div className="flex">
          <button
            onClick={() => handleLaunchAgent()}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-l-md transition-colors inline-flex items-center"
            data-testid="agent-button"
          >
            <SquareTerminal className={`${iconSize.sm} mr-1`} />
            Open Terminal
          </button>
          <button
            onClick={() => setLaunchMenuOpen((prev) => !prev)}
            className="px-1.5 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-r-md border-l border-accent-active transition-colors"
            data-testid="agent-menu-toggle"
          >
            <ChevronDown className={iconSize.xs} />
          </button>
        </div>
        {launchMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-surface-overlay border border-edge-subtle rounded-md shadow-lg z-10 min-w-[160px] animate-slide-up">
            <button
              onClick={() => {
                setLaunchMenuOpen(false);
                handleLaunchAgent();
              }}
              className="w-full text-left px-3 py-2 text-body-sm text-fg hover:bg-surface-hover rounded-t-md transition-colors"
              data-testid="launch-terminal"
            >
              Open Terminal
            </button>
            <button
              onClick={() => {
                setLaunchMenuOpen(false);
                handleLaunchAgent({ planMode: true });
              }}
              className="w-full text-left px-3 py-2 text-body-sm text-fg hover:bg-surface-hover rounded-b-md transition-colors"
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
      {editing ? (
        <div className="mb-6 p-4 bg-surface-raised rounded-lg border border-edge">
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm focus:outline-none focus:border-edge-subtle"
              autoFocus
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (supports Markdown)"
              className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg placeholder-fg-faint text-body-sm focus:outline-none focus:border-edge-subtle resize-none"
              rows={6}
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm focus:outline-none focus:border-edge-subtle"
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
              className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm focus:outline-none focus:border-edge-subtle"
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
                className="px-3 py-1.5 bg-surface-hover hover:bg-surface-overlay text-fg text-label-md rounded-md transition-colors"
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
              {/* Uses text-heading-sm (not text-code-*) because this is the detail header — needs to match heading scale */}
              <span className="text-fg-faint text-heading-sm font-mono mr-3">{task.displayId}</span>
              <h1 className="text-heading-lg font-bold text-fg">{task.title}</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={startEditing}
                className="px-3 py-1.5 bg-surface-hover hover:bg-surface-overlay text-fg text-label-md rounded-md transition-colors inline-flex items-center"
              >
                <Pencil className={`${iconSize.sm} mr-1`} />
                Edit
              </button>
              <button
                onClick={handleArchive}
                className="px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors inline-flex items-center"
              >
                <Archive className={`${iconSize.sm} mr-1`} />
                Archive
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-fg-faint text-label-md">Status:</span>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className="px-2 py-1 bg-surface-inset border border-edge-subtle rounded text-fg text-body-sm focus:outline-none focus:border-edge-subtle"
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
              <span className="text-fg-faint text-label-md">Priority:</span>
              <select
                value={task.priority}
                onChange={(e) => updateTask(taskId, { priority: e.target.value as TaskPriority })}
                className="px-2 py-1 bg-surface-inset border border-edge-subtle rounded text-fg text-body-sm focus:outline-none focus:border-edge-subtle"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-fg-faint text-label-md">Project:</span>
              <select
                value={task.projectId ?? ''}
                onChange={(e) => updateTask(taskId, { projectId: e.target.value || null })}
                className="px-2 py-1 bg-surface-inset border border-edge-subtle rounded text-fg text-body-sm focus:outline-none focus:border-edge-subtle"
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
              <span className="text-fg-faint text-label-md">Assignee:</span>
              <select
                value={task.assignee?.id ?? ''}
                onChange={(e) => updateTask(taskId, { assigneeId: e.target.value || null })}
                className="px-2 py-1 bg-surface-inset border border-edge-subtle rounded text-fg text-body-sm focus:outline-none focus:border-edge-subtle"
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
              <span className="text-fg-faint text-label-md">Labels:</span>
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
              <span className="text-fg-faint text-label-md">Project Directory:</span>
              {dirLoading ? (
                <p className="text-fg-faint text-body-sm mt-1">Loading...</p>
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
                    className="flex-1 px-2 py-1 bg-surface-inset border border-edge-subtle rounded text-fg text-body-sm font-mono focus:outline-none focus:border-edge-subtle"
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
                    className="px-2 py-1 bg-surface-hover hover:bg-surface-overlay text-fg text-label-sm rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : projectDirectory ? (
                <p
                  className="text-fg-muted text-body-sm font-mono mt-1 cursor-pointer hover:text-fg transition-colors"
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
                  className="text-fg-muted hover:text-fg text-label-md mt-1 transition-colors inline-flex items-center"
                >
                  <FolderOpen className={`${iconSize.sm} mr-1`} />
                  Set project directory...
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-fg-faint text-label-md">Terminal:</span>
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
                    <X className={iconSize.sm} />
                  </button>
                </div>
              </div>
            )}

            <PullRequestList pullRequests={task.pullRequests ?? []} />

            {task.description && (
              <div>
                <span className="text-fg-faint text-label-md block mb-2">Description:</span>
                <MarkdownRenderer content={task.description} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
