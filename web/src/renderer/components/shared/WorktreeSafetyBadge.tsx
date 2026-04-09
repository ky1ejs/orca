import { CheckCircle, AlertTriangle } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import type { WorktreeSafetyResult } from '../../../shared/daemon-protocol.js';

interface WorktreeSafetyBadgeProps {
  safety: WorktreeSafetyResult;
}

export function WorktreeSafetyBadge({ safety }: WorktreeSafetyBadgeProps) {
  const isClean = !safety.dirty && !safety.unpushedCommits && safety.branchMerged;

  if (isClean) {
    return (
      <div className="flex items-center gap-1.5 text-body-xs">
        <CheckCircle className={`${iconSize.xs} text-success`} />
        <span className="text-success">Clean and merged</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-body-xs">
      <AlertTriangle className={`${iconSize.xs} text-warning`} />
      <span className="text-warning">
        {[
          safety.dirty && 'Uncommitted changes',
          safety.unpushedCommits && 'Unpushed commits',
          !safety.branchMerged && 'Branch not merged',
        ]
          .filter(Boolean)
          .join(', ')}
      </span>
    </div>
  );
}
