import { Trash2, FilePlus } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  AuditAction,
  AuditActorType,
  type AuditEventConnection,
} from '../../graphql/__generated__/generated.js';
import { Skeleton } from '../layout/Skeleton.js';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';
import { STATUS_LABELS, PRIORITY_LABELS } from '../../utils/task-status.js';
import { linkifyTaskIds } from '../../utils/linkifyTaskIds.js';
import { TaskSectionHeading } from '../tasks/TaskSectionHeading.js';

type ActivityEdge = AuditEventConnection['edges'][number];
type ActivityNode = ActivityEdge['node'];

const ENUM_DISPLAY: Record<string, string> = { ...STATUS_LABELS, ...PRIORITY_LABELS };

function displayEnum(value: string): string {
  return ENUM_DISPLAY[value] ?? value;
}

function describeChange(change: {
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
}): string | null {
  switch (change.field) {
    case 'status':
      return `changed status from ${displayEnum(change.oldValue ?? '')} to ${displayEnum(change.newValue ?? '')}`;
    case 'assignee':
      if (!change.oldValue && change.newValue) return `assigned to ${change.newValue}`;
      if (change.oldValue && !change.newValue) return `unassigned ${change.oldValue}`;
      return `reassigned from ${change.oldValue} to ${change.newValue}`;
    case 'priority':
      return `changed priority to ${displayEnum(change.newValue ?? '')}`;
    case 'title':
      return 'renamed task';
    case 'description':
      return 'updated description';
    case 'project':
      if (!change.oldValue && change.newValue) return `moved to ${change.newValue}`;
      if (change.oldValue && !change.newValue) return 'removed from project';
      return `moved from ${change.oldValue} to ${change.newValue}`;
    case 'labelsAdded':
      return `added label ${change.newValue}`;
    case 'labelsRemoved':
      return `removed label ${change.oldValue}`;
    case 'initiative':
      if (!change.oldValue && change.newValue) return `added to initiative ${change.newValue}`;
      if (change.oldValue && !change.newValue) return 'removed from initiative';
      return `moved from initiative ${change.oldValue} to ${change.newValue}`;
    case 'relationshipAdded':
      return `added relationship: ${change.newValue}`;
    case 'relationshipRemoved':
      return `removed relationship: ${change.oldValue}`;
    case 'defaultDirectory':
      return 'updated default directory';
    case 'name':
      return 'renamed';
    case 'assigneeId':
    case 'projectId':
    case 'initiativeId':
      return null;
    default:
      return `updated ${change.field}`;
  }
}

function describeEvent(event: ActivityNode): string {
  switch (event.action) {
    case AuditAction.Created:
      return 'created this';
    case AuditAction.Archived:
      return 'deleted this';
    case AuditAction.Updated: {
      const descriptions = event.changes.map(describeChange).filter((d): d is string => d !== null);
      if (descriptions.length === 0) return 'made changes';
      return descriptions.join(' and ');
    }
  }
}

function getActorName(event: ActivityNode): string {
  if (event.actorType === AuditActorType.System) return 'System';
  if (!event.actor) return 'Unknown';
  if ('name' in event.actor) return event.actor.name;
  if ('label' in event.actor) return event.actor.label;
  return 'Unknown';
}

function EventIcon({ action }: { action: AuditAction }) {
  switch (action) {
    case AuditAction.Created:
      return <FilePlus className={`${iconSize.xs} text-success`} />;
    case AuditAction.Archived:
      return <Trash2 className={`${iconSize.xs} text-error`} />;
    case AuditAction.Updated:
      return <div className="w-1.5 h-1.5 rounded-full bg-fg-faint" />;
  }
}

interface ActivityTimelineProps {
  edges: ActivityEdge[];
  hasNextPage: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function ActivityTimeline({
  edges,
  hasNextPage,
  loading,
  onLoadMore,
}: ActivityTimelineProps) {
  if (!loading && edges.length === 0) {
    return (
      <section>
        <TaskSectionHeading title="Activity" />
        <p className="text-fg-faint text-body-sm italic">No activity recorded yet</p>
      </section>
    );
  }

  return (
    <section>
      <TaskSectionHeading title="Activity" />
      {loading && edges.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-edge-subtle" aria-hidden />
          <ul className="space-y-2">
            {edges.map((edge) => (
              <li key={edge.node.id} className="flex items-start gap-3 relative">
                <div className="mt-1.5 flex-shrink-0 flex items-center justify-center w-4 h-4 bg-surface rounded-full z-[1]">
                  <EventIcon action={edge.node.action} />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-body-sm text-fg">
                    <span
                      className={
                        edge.node.actorType === AuditActorType.System
                          ? 'text-fg-muted'
                          : 'font-medium'
                      }
                    >
                      {getActorName(edge.node)}
                    </span>{' '}
                    <span className="text-fg-muted">
                      {linkifyTaskIds(describeEvent(edge.node))}
                    </span>
                  </p>
                  <p className="text-label-sm text-fg-faint">
                    {formatRelativeTime(edge.node.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className="mt-3 ml-7 text-fg-muted hover:text-fg text-label-md transition-colors inline-flex items-center gap-1"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
