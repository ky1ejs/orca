import { PullRequestStatus } from '../../graphql/__generated__/generated.js';

const statusConfig: Record<PullRequestStatus, { label: string; className: string }> = {
  [PullRequestStatus.Open]: {
    label: 'Open',
    className: 'bg-success-muted text-success',
  },
  [PullRequestStatus.Merged]: {
    label: 'Merged',
    className: 'bg-merged-muted text-merged',
  },
  [PullRequestStatus.Closed]: {
    label: 'Closed',
    className: 'bg-error-muted text-error',
  },
};

interface PullRequestBadgeProps {
  status: PullRequestStatus;
  draft: boolean;
}

export function PullRequestBadge({ status, draft }: PullRequestBadgeProps) {
  const config = statusConfig[status];
  const label = draft && status === PullRequestStatus.Open ? 'Draft' : config.label;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-medium ${config.className}`}
    >
      {label}
    </span>
  );
}
