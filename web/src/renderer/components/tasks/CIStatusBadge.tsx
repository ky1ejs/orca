import { CheckStatus } from '../../graphql/__generated__/generated.js';

const statusConfig: Record<
  CheckStatus,
  { label: string; className: string; dotClassName: string }
> = {
  [CheckStatus.Success]: {
    label: 'Passing',
    className: 'bg-success-muted text-success',
    dotClassName: 'bg-success',
  },
  [CheckStatus.Failure]: {
    label: 'Failing',
    className: 'bg-error-muted text-error',
    dotClassName: 'bg-error',
  },
  [CheckStatus.InProgress]: {
    label: 'Running',
    className: 'bg-warning-muted text-warning',
    dotClassName: 'bg-warning animate-pulse',
  },
  [CheckStatus.Pending]: {
    label: 'Pending',
    className: 'bg-warning-muted text-warning',
    dotClassName: 'bg-warning animate-pulse',
  },
  [CheckStatus.Neutral]: {
    label: 'Neutral',
    className: 'bg-surface-hover text-fg-muted',
    dotClassName: 'bg-fg-muted',
  },
  [CheckStatus.Cancelled]: {
    label: 'Cancelled',
    className: 'bg-surface-hover text-fg-muted',
    dotClassName: 'bg-fg-muted',
  },
  [CheckStatus.TimedOut]: {
    label: 'Timed Out',
    className: 'bg-error-muted text-error',
    dotClassName: 'bg-error',
  },
  [CheckStatus.ActionRequired]: {
    label: 'Action Required',
    className: 'bg-warning-muted text-warning',
    dotClassName: 'bg-warning',
  },
};

export const ciDotClassName: Record<CheckStatus, string> = Object.fromEntries(
  Object.entries(statusConfig).map(([k, v]) => [k, v.dotClassName]),
) as Record<CheckStatus, string>;

interface CIStatusBadgeProps {
  status: CheckStatus | null | undefined;
}

export function CIStatusBadge({ status }: CIStatusBadgeProps) {
  if (!status) return null;

  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm font-medium ${config.className}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotClassName}`} />
      {config.label}
    </span>
  );
}
