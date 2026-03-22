import { useInitiativeActivity } from '../../hooks/useGraphQL.js';
import { ActivityFeed } from './ActivityFeed.js';

interface InitiativeActivityFeedProps {
  initiativeId: string;
}

export function InitiativeActivityFeed({ initiativeId }: InitiativeActivityFeedProps) {
  const { data, fetching, error } = useInitiativeActivity(initiativeId);
  return <ActivityFeed activity={data?.initiative?.activity} fetching={fetching} error={error} />;
}
