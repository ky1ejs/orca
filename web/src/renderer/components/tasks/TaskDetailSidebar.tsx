import { useState, memo } from 'react';
import { Trash2, FolderOpen, GitBranch, Code } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import type { UpdateTaskInput } from '../../graphql/__generated__/generated.js';
import { STATUS_ORDER, STATUS_LABELS, PRIORITY_LABELS } from '../../utils/task-status.js';
import { TaskStatusBadge } from './TaskStatusBadge.js';
import { LabelBadge } from '../labels/LabelBadge.js';
import { LabelPicker } from '../labels/LabelPicker.js';
import { useWorktree } from '../../hooks/useWorktree.js';
import { useHasVscode } from '../../hooks/useHasVscode.js';
import { WorktreeSafetyBadge } from '../shared/WorktreeSafetyBadge.js';
import { RemoveWorktreeModal } from '../shared/RemoveWorktreeModal.js';

const STATUS_OPTIONS = STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = Object.entries(
  PRIORITY_LABELS,
).map(([value, label]) => ({ value: value as TaskPriority, label }));

interface TaskDetailSidebarProps {
  task: {
    id: string;
    status: TaskStatus;
    priority: TaskPriority;
    projectId?: string | null;
    assignee?: { id: string; name: string } | null;
    labels: { id: string; name: string; color: string }[];
  };
  updateTask: (id: string, input: UpdateTaskInput) => Promise<unknown>;
  handleStatusChange: (status: TaskStatus) => Promise<void>;
  handleArchive: () => Promise<void>;
  workspaceProjects: { id: string; name: string }[];
  workspaceMembers: { user: { id: string; name: string } }[];
  currentWorkspaceId: string;
  projectDirectory: string | null;
  dirLoading: boolean;
  updateDirectory: (dir: string) => void;
}

export const TaskDetailSidebar = memo(function TaskDetailSidebar({
  task,
  updateTask,
  handleStatusChange,
  handleArchive,
  workspaceProjects,
  workspaceMembers,
  currentWorkspaceId,
  projectDirectory,
  dirLoading,
  updateDirectory,
}: TaskDetailSidebarProps) {
  const [editingDirectory, setEditingDirectory] = useState('');
  const [isEditingDir, setIsEditingDir] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { worktree, safety, loading: worktreeLoading, removeWorktree } = useWorktree(task.id);
  const hasVscode = useHasVscode();

  const selectClass =
    'w-full px-2 py-1.5 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm focus:outline-none focus:border-accent';
  const iconButtonClass =
    'flex-shrink-0 p-0.5 text-fg-faint hover:text-fg rounded transition-colors';

  return (
    <div className="space-y-5">
      <div>
        <label className="text-fg-faint text-label-sm block mb-1.5">Status</label>
        <div className="flex items-center gap-2">
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <TaskStatusBadge status={task.status} />
        </div>
      </div>

      <div>
        <label className="text-fg-faint text-label-sm block mb-1.5">Priority</label>
        <select
          value={task.priority}
          onChange={(e) => updateTask(task.id, { priority: e.target.value as TaskPriority })}
          className={selectClass}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-fg-faint text-label-sm block mb-1.5">Project</label>
        <select
          value={task.projectId ?? ''}
          onChange={(e) => updateTask(task.id, { projectId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Inbox (no project)</option>
          {workspaceProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-fg-faint text-label-sm block mb-1.5">Assignee</label>
        <select
          value={task.assignee?.id ?? ''}
          onChange={(e) => updateTask(task.id, { assigneeId: e.target.value || null })}
          className={selectClass}
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

      <div>
        <label className="text-fg-faint text-label-sm block mb-1.5">Labels</label>
        <div className="flex items-center gap-1 flex-wrap">
          {task.labels.map((label) => (
            <LabelBadge
              key={label.id}
              name={label.name}
              color={label.color}
              onRemove={() =>
                updateTask(task.id, {
                  labelIds: task.labels.filter((l) => l.id !== label.id).map((l) => l.id),
                })
              }
            />
          ))}
          {currentWorkspaceId && (
            <LabelPicker
              workspaceId={currentWorkspaceId}
              selectedLabelIds={task.labels.map((l) => l.id)}
              onChange={(labelIds) => updateTask(task.id, { labelIds })}
            />
          )}
        </div>
      </div>

      <div className="border-t border-edge-subtle pt-5">
        <label className="text-fg-faint text-label-sm block mb-1.5">Project Directory</label>
        {dirLoading ? (
          <p className="text-fg-faint text-body-sm">Loading...</p>
        ) : isEditingDir ? (
          <div className="space-y-2">
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
              className="w-full px-2 py-1.5 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm font-mono focus:outline-none focus:border-accent"
              autoFocus
            />
            <div className="flex gap-2">
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
          </div>
        ) : projectDirectory ? (
          <p
            className="text-fg-muted text-body-sm font-mono cursor-pointer hover:text-fg transition-colors truncate"
            title={projectDirectory}
            role="button"
            tabIndex={0}
            onClick={() => {
              setEditingDirectory(projectDirectory);
              setIsEditingDir(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setEditingDirectory(projectDirectory);
                setIsEditingDir(true);
              }
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
            className="text-fg-muted hover:text-fg text-label-sm transition-colors inline-flex items-center"
          >
            <FolderOpen className={`${iconSize.sm} mr-1`} />
            Set directory...
          </button>
        )}
      </div>

      {!worktreeLoading && worktree && (
        <div className="border-t border-edge-subtle pt-5">
          <label className="text-fg-faint text-label-sm block mb-1.5">Worktree</label>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <GitBranch className={`${iconSize.xs} text-fg-faint flex-shrink-0`} />
              <span
                className="text-fg-muted text-code-sm font-mono truncate"
                title={worktree.branch_name}
              >
                {worktree.branch_name}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <p
                className="text-fg-faint text-body-sm font-mono truncate flex-1 min-w-0"
                title={worktree.worktree_path}
              >
                {worktree.worktree_path}
              </p>
              <button
                onClick={() =>
                  void window.orca.shell.openPath(worktree.worktree_path).catch(() => {})
                }
                className={iconButtonClass}
                title="Open in Finder"
                aria-label="Open in Finder"
              >
                <FolderOpen className={iconSize.xs} />
              </button>
              {hasVscode && (
                <button
                  onClick={() =>
                    void window.orca.shell.openInVscode(worktree.worktree_path).catch(() => {})
                  }
                  className={iconButtonClass}
                  title="Open in VS Code"
                  aria-label="Open in VS Code"
                >
                  <Code className={iconSize.xs} />
                </button>
              )}
            </div>
            {safety && <WorktreeSafetyBadge safety={safety} />}
            <button
              onClick={() => setConfirmRemove(true)}
              className="px-2 py-1 bg-error-muted hover:bg-error-strong text-error text-label-sm rounded transition-colors inline-flex items-center"
            >
              <Trash2 className={`${iconSize.xs} mr-1`} />
              Remove worktree
            </button>
          </div>
        </div>
      )}

      {confirmRemove && worktree && (
        <RemoveWorktreeModal
          worktreePath={worktree.worktree_path}
          branchName={worktree.branch_name}
          onRemove={removeWorktree}
          onClose={() => setConfirmRemove(false)}
        />
      )}

      <div className="border-t border-edge-subtle pt-5">
        <button
          onClick={handleArchive}
          className="w-full px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors inline-flex items-center justify-center"
        >
          <Trash2 className={`${iconSize.sm} mr-1`} />
          Delete Task
        </button>
      </div>
    </div>
  );
});
