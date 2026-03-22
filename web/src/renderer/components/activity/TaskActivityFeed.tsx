import { useTaskActivity } from '../../hooks/useGraphQL.js';
import { ActivityFeed } from './ActivityFeed.js';

interface TaskActivityFeedProps {
  taskId: string;
}

export function TaskActivityFeed({ taskId }: TaskActivityFeedProps) {
  const { data, fetching, error } = useTaskActivity(taskId);
  return <ActivityFeed activity={data?.task?.activity} fetching={fetching} error={error} />;
}
