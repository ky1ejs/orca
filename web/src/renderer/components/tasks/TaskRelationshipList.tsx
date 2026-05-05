import { useState, memo } from 'react';
import { useClient } from 'urql';
import { X, Plus, Link2, Loader2, ArrowUpRight } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  type TaskQuery,
  TaskRelationshipDisplayType,
  TaskRelationshipType,
  TaskByDisplayIdDocument,
} from '../../graphql/__generated__/generated.js';
import { TaskStatusBadge } from './TaskStatusBadge.js';
import { TaskSectionHeading } from './TaskSectionHeading.js';
import { useCreateTaskRelationship, useRemoveTaskRelationship } from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';

type RelationshipItem = NonNullable<TaskQuery['task']>['relationships'][number];

interface TaskRelationshipListProps {
  relationships: RelationshipItem[];
  taskId: string;
  workspaceId: string;
  onMutate?: () => void;
}

const DISPLAY_TYPE_LABELS: Record<TaskRelationshipDisplayType, string> = {
  [TaskRelationshipDisplayType.Blocks]: 'Blocks',
  [TaskRelationshipDisplayType.BlockedBy]: 'Blocked by',
  [TaskRelationshipDisplayType.RelatesTo]: 'Relates to',
  [TaskRelationshipDisplayType.Duplicates]: 'Duplicates',
  [TaskRelationshipDisplayType.DuplicatedBy]: 'Duplicated by',
  [TaskRelationshipDisplayType.CreatedFrom]: 'Created from',
  [TaskRelationshipDisplayType.Created]: 'Created',
};

const DISPLAY_TYPE_ORDER: TaskRelationshipDisplayType[] = [
  TaskRelationshipDisplayType.BlockedBy,
  TaskRelationshipDisplayType.Blocks,
  TaskRelationshipDisplayType.RelatesTo,
  TaskRelationshipDisplayType.Duplicates,
  TaskRelationshipDisplayType.DuplicatedBy,
  TaskRelationshipDisplayType.CreatedFrom,
  TaskRelationshipDisplayType.Created,
];

const MANUAL_RELATIONSHIP_TYPES: { value: TaskRelationshipType; label: string }[] = [
  { value: TaskRelationshipType.Blocks, label: 'Blocks' },
  { value: TaskRelationshipType.RelatesTo, label: 'Relates to' },
  { value: TaskRelationshipType.Duplicates, label: 'Duplicates' },
];

function groupByDisplayType(
  relationships: RelationshipItem[],
): Map<TaskRelationshipDisplayType, RelationshipItem[]> {
  const groups = new Map<TaskRelationshipDisplayType, RelationshipItem[]>();
  for (const rel of relationships) {
    const dt = rel.displayType;
    const list = groups.get(dt) ?? [];
    list.push(rel);
    groups.set(dt, list);
  }
  return groups;
}

export const TaskRelationshipList = memo(function TaskRelationshipList({
  relationships,
  taskId,
  workspaceId,
  onMutate,
}: TaskRelationshipListProps) {
  const client = useClient();
  const { navigate } = useNavigation();
  const { createTaskRelationship, fetching: creating } = useCreateTaskRelationship();
  const { removeTaskRelationship, fetching: removing } = useRemoveTaskRelationship();
  const [showForm, setShowForm] = useState(false);
  const [targetDisplayId, setTargetDisplayId] = useState('');
  const [type, setType] = useState<TaskRelationshipType>(TaskRelationshipType.RelatesTo);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    const trimmed = targetDisplayId.trim().toUpperCase();
    if (!trimmed) return;
    if (!workspaceId) {
      setError('No workspace selected');
      return;
    }

    const lookupResult = await client
      .query(TaskByDisplayIdDocument, { displayId: trimmed, workspaceId })
      .toPromise();

    if (lookupResult.error) {
      setError(lookupResult.error.graphQLErrors[0]?.message ?? lookupResult.error.message);
      return;
    }

    const targetTask = lookupResult.data?.taskByDisplayId;
    if (!targetTask) {
      setError(`Task "${trimmed}" not found in this workspace`);
      return;
    }

    if (targetTask.id === taskId) {
      setError('Cannot create a relationship between a task and itself');
      return;
    }

    const result = await createTaskRelationship({
      sourceTaskId: taskId,
      targetTaskId: targetTask.id,
      type,
    });

    if (result.error) {
      setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
      return;
    }

    setTargetDisplayId('');
    setShowForm(false);
    onMutate?.();
  };

  const handleRemove = async (id: string) => {
    const result = await removeTaskRelationship(id);
    if (result.error) {
      setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
      return;
    }
    onMutate?.();
  };

  const handleCancel = () => {
    setShowForm(false);
    setTargetDisplayId('');
    setType(TaskRelationshipType.RelatesTo);
    setError(null);
  };

  const grouped = groupByDisplayType(relationships);

  return (
    <section>
      <TaskSectionHeading
        title="Relationships"
        count={relationships.length}
        action={
          !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1 text-fg-muted hover:text-fg text-label-md px-2 py-1 rounded-md hover:bg-surface-hover transition-colors"
            >
              <Plus className={iconSize.xs} />
              Add link
            </button>
          )
        }
      />
      {relationships.length > 0 && (
        <div className="space-y-3">
          {DISPLAY_TYPE_ORDER.filter((dt) => grouped.has(dt)).map((dt) => (
            <div key={dt}>
              <span className="text-fg-faint text-label-sm font-medium uppercase tracking-wider block mb-1.5">
                {DISPLAY_TYPE_LABELS[dt]}
              </span>
              <div className="space-y-1">
                {grouped.get(dt)!.map((rel) => (
                  <div
                    key={rel.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate({ view: 'task', id: rel.relatedTask.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate({ view: 'task', id: rel.relatedTask.id });
                      }
                    }}
                    className="group flex items-center gap-2 px-3 py-2 bg-surface-raised border border-edge-subtle rounded-md cursor-pointer transition-colors hover:bg-surface-hover/40 hover:border-edge"
                  >
                    <span className="text-fg-muted font-mono text-code flex-shrink-0">
                      {rel.relatedTask.displayId}
                    </span>
                    <span className="text-fg text-body-sm truncate">{rel.relatedTask.title}</span>
                    <div className="flex-1" />
                    <TaskStatusBadge status={rel.relatedTask.status} />
                    <ArrowUpRight
                      className={`${iconSize.xs} text-fg-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(rel.id);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      disabled={removing}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 text-fg-faint hover:text-error hover:bg-error-muted/40 rounded transition-all"
                      title="Remove relationship"
                      aria-label={`Remove relationship with ${rel.relatedTask.displayId}`}
                    >
                      <X className={iconSize.xs} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <Link2 className={`${iconSize.sm} text-fg-faint flex-shrink-0`} />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskRelationshipType)}
              className="px-2 py-1.5 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm focus:outline-none focus:border-accent"
            >
              {MANUAL_RELATIONSHIP_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={targetDisplayId}
              onChange={(e) => setTargetDisplayId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') handleCancel();
              }}
              placeholder="WORKSPACE-123"
              className="flex-1 px-3 py-1.5 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm placeholder-fg-faint focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleAdd}
              disabled={creating || !targetDisplayId.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-1"
            >
              {creating && <Loader2 className={`${iconSize.xs} animate-spin`} />}
              Add
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 bg-surface-hover hover:bg-surface-overlay text-fg text-label-md rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : relationships.length === 0 ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mt-1 px-4 py-3 border border-dashed border-edge-subtle rounded-md text-fg-faint hover:text-fg-muted hover:border-edge text-label-md transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Plus className={iconSize.xs} />
          Add Relationship
        </button>
      ) : null}
      {error && <p className="text-error text-label-sm mt-2">{error}</p>}
    </section>
  );
});
