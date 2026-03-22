import { GitPullRequest } from 'lucide-react';
import { PullRequestStatus } from '../../graphql/__generated__/generated.js';

const statusColorMap: Record<PullRequestStatus, string> = {
  [PullRequestStatus.Merged]: 'text-merged',
  [PullRequestStatus.Closed]: 'text-error',
  [PullRequestStatus.Open]: 'text-success',
};

interface PullRequestIconProps {
  status: PullRequestStatus;
  className?: string;
}

export function PullRequestIcon({ status, className }: PullRequestIconProps) {
  return (
    <GitPullRequest className={`${className ?? ''} flex-shrink-0 ${statusColorMap[status]}`} />
  );
}
