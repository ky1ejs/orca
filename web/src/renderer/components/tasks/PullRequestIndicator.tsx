import { GitPullRequest } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';

interface PullRequestIndicatorProps {
  count: number;
}

export function PullRequestIndicator({ count }: PullRequestIndicatorProps) {
  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-fg-muted text-label-sm flex-shrink-0">
      <GitPullRequest className={iconSize.xs} />
      {count}
    </span>
  );
}
