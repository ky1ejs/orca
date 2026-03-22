import { useProjectActivity } from '../../hooks/useGraphQL.js';
import { ActivityFeed } from './ActivityFeed.js';

interface ProjectActivityFeedProps {
  projectId: string;
}

export function ProjectActivityFeed({ projectId }: ProjectActivityFeedProps) {
  const { data, fetching, error } = useProjectActivity(projectId);
  return <ActivityFeed activity={data?.project?.activity} fetching={fetching} error={error} />;
}
