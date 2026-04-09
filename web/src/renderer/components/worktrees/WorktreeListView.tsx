import { useState, useMemo } from 'react';
import { GitBranch, FolderOpen, Code, Trash2, RefreshCw, GitFork } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { useWorktreeList } from '../../hooks/useWorktreeList.js';
import { useHasVscode } from '../../hooks/useHasVscode.js';
import { useWorkspaceData } from '../../workspace/workspace-data-context.js';
import { useNavigation } from '../../navigation/context.js';
import { WorktreeSafetyBadge } from '../shared/WorktreeSafetyBadge.js';
import { RemoveWorktreeModal } from '../shared/RemoveWorktreeModal.js';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

interface TaskInfo {
  id: string;
  displayId: string;
  title: string;
  projectId: string;
  projectName: string;
}

export function WorktreeListView() {
  const { worktrees, loading, removeWorktree, refetch } = useWorktreeList();
  const { projects, inboxTasks } = useWorkspaceData();
  const { navigate } = useNavigation();
  const hasVscode = useHasVscode();

  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);

  const taskMap = useMemo(() => {
    const map = new Map<string, TaskInfo>();
    for (const project of projects) {
      for (const task of project.tasks) {
        map.set(task.id, {
          id: task.id,
          displayId: task.displayId,
          title: task.title,
          projectId: project.id,
          projectName: project.name,
        });
      }
    }
    for (const task of inboxTasks) {
      if (!map.has(task.id)) {
        map.set(task.id, {
          id: task.id,
          displayId: task.displayId,
          title: task.title,
          projectId: '',
          projectName: '',
        });
      }
    }
    return map;
  }, [projects, inboxTasks]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, typeof worktrees>();
    for (const wt of worktrees) {
      const list = groups.get(wt.repo_path) ?? [];
      list.push(wt);
      groups.set(wt.repo_path, list);
    }
    return { entries: [...groups.entries()], size: groups.size };
  }, [worktrees]);

  const removingWorktree = removingTaskId
    ? worktrees.find((wt) => wt.task_id === removingTaskId)
    : null;

  const iconButtonClass =
    'flex-shrink-0 p-0.5 text-fg-faint hover:text-fg rounded transition-colors';

  if (loading && worktrees.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-heading-lg font-semibold text-fg mb-6">Worktrees</h1>
        <p className="text-fg-muted text-body-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-heading-lg font-semibold text-fg">Worktrees</h1>
          {worktrees.length > 0 && (
            <span className="text-label-sm text-fg-faint bg-surface-inset rounded-full px-2 py-0.5">
              {worktrees.length}
            </span>
          )}
        </div>
        <button
          onClick={refetch}
          className="p-1.5 text-fg-faint hover:text-fg rounded transition-colors"
          title="Refresh"
          aria-label="Refresh worktree list"
        >
          <RefreshCw className={iconSize.sm} />
        </button>
      </div>

      {worktrees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GitFork className="w-10 h-10 text-fg-faint mb-3" />
          <p className="text-fg-muted text-body-sm">No active worktrees</p>
          <p className="text-fg-faint text-body-xs mt-1">
            Worktrees are created when you launch an agent on a task
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEntries.entries.map(([repoPath, repoWorktrees]) => (
            <div key={repoPath}>
              {groupedEntries.size > 1 && (
                <h2
                  className="text-label-sm text-fg-faint font-mono mb-2 truncate"
                  title={repoPath}
                >
                  {repoPath}
                </h2>
              )}
              <div className="space-y-2">
                {repoWorktrees.map((wt) => {
                  const taskInfo = taskMap.get(wt.task_id);
                  return (
                    <div
                      key={wt.task_id}
                      className="bg-surface-inset border border-edge-subtle rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          {taskInfo ? (
                            <button
                              onClick={() =>
                                navigate({
                                  view: 'task',
                                  id: taskInfo.id,
                                  taskName: taskInfo.title,
                                  projectId: taskInfo.projectId || undefined,
                                  projectName: taskInfo.projectName || undefined,
                                })
                              }
                              className="text-left hover:text-accent transition-colors"
                            >
                              <span className="text-fg-faint text-label-sm font-mono mr-1.5">
                                {taskInfo.displayId}
                              </span>
                              <span className="text-fg text-body-sm">{taskInfo.title}</span>
                            </button>
                          ) : (
                            <span className="text-fg-faint text-label-sm font-mono">
                              {wt.task_id.slice(0, 8)}...
                            </span>
                          )}

                          <div className="flex items-center gap-1.5">
                            <GitBranch className={`${iconSize.xs} text-fg-faint flex-shrink-0`} />
                            <span
                              className="text-fg-muted text-code-sm font-mono truncate"
                              title={wt.branch_name}
                            >
                              {wt.branch_name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <p
                              className="text-fg-faint text-body-xs font-mono truncate flex-1 min-w-0"
                              title={wt.worktree_path}
                            >
                              {wt.worktree_path}
                            </p>
                            <button
                              onClick={() =>
                                void window.orca.shell.openPath(wt.worktree_path).catch(() => {})
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
                                  void window.orca.shell
                                    .openInVscode(wt.worktree_path)
                                    .catch(() => {})
                                }
                                className={iconButtonClass}
                                title="Open in VS Code"
                                aria-label="Open in VS Code"
                              >
                                <Code className={iconSize.xs} />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <WorktreeSafetyBadge safety={wt.safety} />
                            {wt.created_at && (
                              <span className="text-fg-faint text-body-xs">
                                {formatRelativeTime(wt.created_at)}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => setRemovingTaskId(wt.task_id)}
                          className="flex-shrink-0 p-1.5 text-fg-faint hover:text-error rounded transition-colors"
                          title="Remove worktree"
                          aria-label="Remove worktree"
                        >
                          <Trash2 className={iconSize.sm} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {removingTaskId && removingWorktree && (
        <RemoveWorktreeModal
          worktreePath={removingWorktree.worktree_path}
          branchName={removingWorktree.branch_name}
          onRemove={(force) => removeWorktree(removingTaskId, force)}
          onClose={() => setRemovingTaskId(null)}
        />
      )}
    </div>
  );
}
