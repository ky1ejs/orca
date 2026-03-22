import { useState, useCallback } from 'react';
import type { AuditEventConnection } from '../graphql/__generated__/generated.js';

type ActivityEdge = AuditEventConnection['edges'][number];

export function useActivityEdges(
  activity: AuditEventConnection | null | undefined,
  onAdvanceCursor: (cursor: string) => void,
) {
  const [accumulatedEdges, setAccumulatedEdges] = useState<ActivityEdge[]>([]);

  const handleLoadMore = useCallback(() => {
    if (!activity?.pageInfo.endCursor) return;
    setAccumulatedEdges((prev) => {
      if (prev.length === 0) return activity.edges ?? [];
      return [...prev, ...(activity.edges ?? [])];
    });
    onAdvanceCursor(activity.pageInfo.endCursor);
  }, [activity, onAdvanceCursor]);

  const displayEdges =
    accumulatedEdges.length > 0
      ? [...accumulatedEdges, ...(activity?.edges ?? [])]
      : (activity?.edges ?? []);

  return {
    displayEdges,
    hasNextPage: activity?.pageInfo.hasNextPage ?? false,
    handleLoadMore,
    reset: () => setAccumulatedEdges([]),
  };
}
