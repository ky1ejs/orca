import { useState, useEffect, useCallback } from 'react';
import { GitBranch, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import type { WorktreeGetResult, WorktreeSafetyResult } from '../../../shared/daemon-protocol.js';

interface WorktreeSectionProps {
  taskId: string;
  hasActiveSession: boolean;
}

export function WorktreeSection({ taskId, hasActiveSession }: WorktreeSectionProps) {
  const [worktree, setWorktree] = useState<WorktreeGetResult | null>(null);
  const [safety, setSafety] = useState<WorktreeSafetyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const refresh = useCallback(async () => {
    const [wt, s] = await Promise.all([
      window.orca.worktree.get(taskId),
      window.orca.worktree.safety(taskId),
    ]);
    setWorktree(wt);
    setSafety(wt ? s : null);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRemove = async (force: boolean) => {
    setRemoving(true);
    try {
      await window.orca.worktree.remove(taskId, force);
      setWorktree(null);
      setSafety(null);
      setConfirmingRemove(false);
    } finally {
      setRemoving(false);
    }
  };

  if (loading) return null;
  if (!worktree) return null;

  const safe = safety && !safety.dirty && !safety.unpushedCommits && safety.branchMerged;
  const warnings: string[] = [];
  if (safety?.dirty) warnings.push('Uncommitted changes');
  if (safety?.unpushedCommits) warnings.push('Unpushed commits');
  if (safety && !safety.branchMerged) warnings.push('Branch not merged');

  return (
    <div>
      <label className="text-fg-faint text-label-sm block mb-1.5">Worktree</label>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-body-sm text-fg-muted">
          <GitBranch className={iconSize.xs} />
          <span className="font-mono truncate" title={worktree.branch_name}>
            {worktree.branch_name}
          </span>
        </div>
        <p className="text-fg-faint text-body-xs font-mono truncate" title={worktree.worktree_path}>
          {worktree.worktree_path}
        </p>

        {safety && (
          <div className="flex items-center gap-1.5 text-body-xs">
            {safe ? (
              <>
                <CheckCircle className={`${iconSize.xs} text-success`} />
                <span className="text-success">Clean and merged</span>
              </>
            ) : (
              <>
                <AlertTriangle className={`${iconSize.xs} text-warning`} />
                <span className="text-warning">{warnings.join(', ')}</span>
              </>
            )}
          </div>
        )}

        {confirmingRemove ? (
          <div className="space-y-2">
            {warnings.length > 0 && (
              <div className="p-2 bg-warning-muted rounded-md text-body-xs text-warning">
                <p className="font-medium mb-1">This worktree has unresolved changes:</p>
                <ul className="list-disc list-inside">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleRemove(warnings.length > 0)}
                disabled={removing}
                className="px-2 py-1 bg-error-muted hover:bg-error-strong text-error text-label-sm rounded transition-colors"
              >
                {removing ? 'Removing...' : 'Confirm Remove'}
              </button>
              <button
                onClick={() => setConfirmingRemove(false)}
                className="px-2 py-1 bg-surface-hover hover:bg-surface-overlay text-fg text-label-sm rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingRemove(true)}
            disabled={hasActiveSession}
            title={hasActiveSession ? 'Stop the agent before removing the worktree' : undefined}
            className="px-2 py-1 bg-surface-hover hover:bg-surface-overlay text-fg-muted hover:text-fg text-label-sm rounded transition-colors inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className={`${iconSize.xs} mr-1`} />
            Remove Worktree
          </button>
        )}
      </div>
    </div>
  );
}
