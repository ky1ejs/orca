import { TaskStatus } from '../../graphql/generated.js';

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  [TaskStatus.Todo]: {
    label: 'Todo',
    className: 'bg-gray-700 text-gray-300',
  },
  [TaskStatus.InProgress]: {
    label: 'In Progress',
    className: 'bg-blue-900 text-blue-300',
  },
  [TaskStatus.InReview]: {
    label: 'In Review',
    className: 'bg-yellow-900 text-yellow-300',
  },
  [TaskStatus.Done]: {
    label: 'Done',
    className: 'bg-green-900 text-green-300',
  },
};

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
      data-testid="task-status-badge"
    >
      {config.label}
    </span>
  );
}
