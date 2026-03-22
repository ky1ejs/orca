import { TaskStatus } from '../graphql/__generated__/generated.js';

export const STATUS_ORDER: TaskStatus[] = [
  TaskStatus.InProgress,
  TaskStatus.InReview,
  TaskStatus.Todo,
  TaskStatus.Done,
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.InProgress]: 'In Progress',
  [TaskStatus.InReview]: 'In Review',
  [TaskStatus.Todo]: 'Todo',
  [TaskStatus.Done]: 'Done',
};

export function groupTasksByStatus<T extends { status: TaskStatus }>(
  tasks: T[],
): Record<TaskStatus, T[]> {
  const groups: Record<TaskStatus, T[]> = {
    [TaskStatus.InProgress]: [],
    [TaskStatus.InReview]: [],
    [TaskStatus.Todo]: [],
    [TaskStatus.Done]: [],
  };
  for (const task of tasks) {
    groups[task.status].push(task);
  }
  return groups;
}
