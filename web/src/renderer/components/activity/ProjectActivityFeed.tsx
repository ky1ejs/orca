import { useState, useCallback } from 'react';
import { useProjectActivity } from '../../hooks/useGraphQL.js';
import { useActivityEdges } from '../../hooks/useActivityEdges.js';
import { ActivityTimeline } from './ActivityTimeline.js';

interface ProjectActivityFeedProps {
  projectId: string;
}

export function ProjectActivityFeed({ projectId }: ProjectActivityFeedProps) {
  const [afterCursor, setAfterCursor] = useState<string | null>(null);
  const { data, fetching, error } = useProjectActivity(projectId, 20, afterCursor);
  const activity = data?.project?.activity;

  const onAdvanceCursor = useCallback((cursor: string) => setAfterCursor(cursor), []);
  const { displayEdges, hasNextPage, handleLoadMore, reset } = useActivityEdges(
    activity,
    onAdvanceCursor,
  );

  if (error) {
    return (
      <div>
        <span className="text-fg-faint text-label-md block mb-2">Activity</span>
        <p className="text-error text-body-sm">
          Failed to load activity.{' '}
          <button
            onClick={() => {
              reset();
              setAfterCursor(null);
            }}
            className="underline hover:no-underline"
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  return (
    <ActivityTimeline
      edges={displayEdges}
      hasNextPage={hasNextPage}
      loading={fetching}
      onLoadMore={handleLoadMore}
    />
  );
}
