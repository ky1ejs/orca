import { useState, useCallback } from 'react';
import { ActivityTimeline } from './ActivityTimeline.js';
import type { AuditEventConnection } from '../../graphql/__generated__/generated.js';

type ActivityEdge = AuditEventConnection['edges'][number];

interface ActivityFeedProps {
  activity: AuditEventConnection | null | undefined;
  fetching: boolean;
  error: unknown;
}

export function ActivityFeed({ activity, fetching, error }: ActivityFeedProps) {
  const [allEdges, setAllEdges] = useState<ActivityEdge[]>([]);
  const [afterCursor, setAfterCursor] = useState<string | null>(null);

  const hasNextPage = activity?.pageInfo.hasNextPage ?? false;

  const handleLoadMore = useCallback(() => {
    if (!activity?.pageInfo.endCursor) return;
    setAllEdges((prev) => {
      const base = prev.length === 0 ? (activity.edges ?? []) : prev;
      return [...base, ...(prev.length === 0 ? [] : (activity.edges ?? []))];
    });
    setAfterCursor(activity.pageInfo.endCursor);
  }, [activity]);

  if (error) {
    return (
      <div>
        <span className="text-fg-faint text-label-md block mb-2">Activity</span>
        <p className="text-error text-body-sm">
          Failed to load activity.{' '}
          <button onClick={() => setAfterCursor(null)} className="underline hover:no-underline">
            Retry
          </button>
        </p>
      </div>
    );
  }

  const displayEdges = afterCursor
    ? [...allEdges, ...(activity?.edges ?? [])]
    : (activity?.edges ?? []);

  return (
    <ActivityTimeline
      edges={displayEdges}
      hasNextPage={hasNextPage}
      loading={fetching}
      onLoadMore={handleLoadMore}
    />
  );
}
