import { TaskPriority, TaskStatus } from '../graphql/__generated__/generated.js';

export const STATUS_ORDER: TaskStatus[] = [
  TaskStatus.InProgress,
  TaskStatus.InReview,
  TaskStatus.Todo,
  TaskStatus.Done,
  TaskStatus.Cancelled,
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.InProgress]: 'In Progress',
  [TaskStatus.InReview]: 'In Review',
  [TaskStatus.Todo]: 'Todo',
  [TaskStatus.Done]: 'Done',
  [TaskStatus.Cancelled]: 'Cancelled',
};

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([TaskStatus.Done, TaskStatus.Cancelled]);

export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export const DEFAULT_COLLAPSED_STATUSES: Record<string, boolean> = {
  [TaskStatus.Done]: true,
  [TaskStatus.Cancelled]: true,
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.None]: 'None',
  [TaskPriority.Low]: 'Low',
  [TaskPriority.Medium]: 'Medium',
  [TaskPriority.High]: 'High',
  [TaskPriority.Urgent]: 'Urgent',
};

export function groupTasksByStatus<T extends { status: TaskStatus }>(
  tasks: T[],
): Record<TaskStatus, T[]> {
  const groups: Record<TaskStatus, T[]> = {
    [TaskStatus.InProgress]: [],
    [TaskStatus.InReview]: [],
    [TaskStatus.Todo]: [],
    [TaskStatus.Done]: [],
    [TaskStatus.Cancelled]: [],
  };
  for (const task of tasks) {
    groups[task.status].push(task);
  }
  return groups;
}
