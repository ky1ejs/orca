import { useState, useEffect } from 'react';
import { GitBranch, Check } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { useWorktree } from '../../hooks/useWorktree.js';

interface TaskBranchBadgeProps {
  taskId: string;
}

export function TaskBranchBadge({ taskId }: TaskBranchBadgeProps) {
  const { worktree, loading } = useWorktree(taskId);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  if (loading || !worktree) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(worktree.branch_name).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCopy(e as unknown as React.MouseEvent);
        }
      }}
      title={copied ? 'Copied!' : `Copy branch: ${worktree.branch_name}`}
      className="inline-flex items-center gap-0.5 max-w-[140px] text-fg-faint text-label-sm font-mono hover:text-fg-muted transition-colors cursor-pointer"
    >
      {copied ? (
        <Check className={`${iconSize.xs} text-success flex-shrink-0`} />
      ) : (
        <GitBranch className={`${iconSize.xs} flex-shrink-0`} />
      )}
      <span className="truncate">{worktree.branch_name}</span>
    </span>
  );
}
