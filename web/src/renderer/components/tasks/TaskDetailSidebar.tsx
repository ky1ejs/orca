import { useState, memo } from 'react';
import { Trash2, FolderOpen, GitBranch, Code, Pencil } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import type { UpdateTaskInput } from '../../graphql/__generated__/generated.js';
import { LabelBadge } from '../labels/LabelBadge.js';
import { LabelPicker } from '../labels/LabelPicker.js';
import { useWorktree } from '../../hooks/useWorktree.js';
import { useHasVscode } from '../../hooks/useHasVscode.js';
import { WorktreeSafetyBadge } from '../shared/WorktreeSafetyBadge.js';
import { RemoveWorktreeModal } from '../shared/RemoveWorktreeModal.js';
import { PropertyRow } from './PropertyRow.js';
import { StatusChip } from './StatusChip.js';
import { PriorityChip } from './PriorityChip.js';
import { ProjectChip } from './ProjectChip.js';
import { AssigneeChip } from './AssigneeChip.js';

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

  const iconButtonClass =
    'flex-shrink-0 p-1 text-fg-faint hover:text-fg hover:bg-surface-hover rounded transition-colors';

  return (
    <div className="space-y-1">
      <div className="space-y-0.5">
        <PropertyRow label="Status">
          <StatusChip status={task.status} onChange={handleStatusChange} />
        </PropertyRow>
        <PropertyRow label="Priority">
          <PriorityChip
            priority={task.priority}
            onChange={(priority) => updateTask(task.id, { priority })}
          />
        </PropertyRow>
        <PropertyRow label="Project">
          <ProjectChip
            projectId={task.projectId}
            projects={workspaceProjects}
            onChange={(projectId) => updateTask(task.id, { projectId })}
          />
        </PropertyRow>
        <PropertyRow label="Assignee">
          <AssigneeChip
            assignee={task.assignee ?? null}
            members={workspaceMembers}
            onChange={(assigneeId) => updateTask(task.id, { assigneeId })}
            testId="assignee-select"
          />
        </PropertyRow>
      </div>

      <div className="border-t border-edge-subtle pt-4 mt-4">
        <span className="text-fg-faint text-label-sm block mb-2">Labels</span>
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
          {task.labels.length === 0 && !currentWorkspaceId && (
            <span className="text-fg-faint text-label-sm italic">No labels</span>
          )}
        </div>
      </div>

      {!worktreeLoading && worktree && (
        <div className="border-t border-edge-subtle pt-4 mt-4">
          <span className="text-fg-faint text-label-sm block mb-2">Worktree</span>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 max-w-full bg-surface-inset border border-edge-subtle rounded-md px-2 py-1">
              <GitBranch className={`${iconSize.xs} text-fg-faint flex-shrink-0`} />
              <span className="text-fg text-code font-mono truncate" title={worktree.branch_name}>
                {worktree.branch_name}
              </span>
            </div>
            <div className="flex items-center gap-1 group">
              <p
                className="text-fg-muted text-code-sm font-mono truncate flex-1 min-w-0"
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
              className="inline-flex items-center gap-1 text-error hover:bg-error-muted/60 text-label-sm px-2 py-1 -mx-2 rounded-md transition-colors"
            >
              <Trash2 className={iconSize.xs} />
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

      <div className="border-t border-edge-subtle pt-4 mt-4 space-y-3">
        <div>
          <span className="text-fg-faint text-label-sm block mb-1.5">Project Directory</span>
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
            <button
              type="button"
              onClick={() => {
                setEditingDirectory(projectDirectory);
                setIsEditingDir(true);
              }}
              className="group inline-flex items-center gap-1.5 max-w-full text-fg-muted hover:text-fg text-code font-mono transition-colors"
              title={projectDirectory}
            >
              <span className="truncate">{projectDirectory}</span>
              <Pencil
                className={`${iconSize.xs} text-fg-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`}
              />
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingDirectory('');
                setIsEditingDir(true);
              }}
              className="text-fg-muted hover:text-fg text-label-sm transition-colors inline-flex items-center gap-1"
            >
              <FolderOpen className={iconSize.sm} />
              Set directory...
            </button>
          )}
        </div>

        <button
          onClick={handleArchive}
          className="inline-flex items-center gap-1 text-error hover:bg-error-muted/60 text-label-sm px-2 py-1 -mx-2 rounded-md transition-colors"
        >
          <Trash2 className={iconSize.xs} />
          Delete Task
        </button>
      </div>
    </div>
  );
});
