import { TaskStatus } from '../../graphql/__generated__/generated.js';

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  [TaskStatus.Todo]: {
    label: 'Todo',
    className: 'bg-surface-hover text-fg-muted',
  },
  [TaskStatus.InProgress]: {
    label: 'In Progress',
    className: 'bg-info-muted text-info',
  },
  [TaskStatus.InReview]: {
    label: 'In Review',
    className: 'bg-warning-muted text-warning',
  },
  [TaskStatus.Done]: {
    label: 'Done',
    className: 'bg-success-muted text-success',
  },
};

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-medium ${config.className}`}
      data-testid="task-status-badge"
    >
      {config.label}
    </span>
  );
}
