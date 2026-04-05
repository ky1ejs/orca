import { useState, memo } from 'react';
import { useClient } from 'urql';
import { X, Plus, Link2, Loader2 } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  type TaskQuery,
  TaskRelationshipDisplayType,
  TaskRelationshipType,
  TaskByDisplayIdDocument,
} from '../../graphql/__generated__/generated.js';
import { TaskStatusBadge } from './TaskStatusBadge.js';
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

    // Resolve displayId to task ID
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
    <div>
      <span className="text-fg-faint text-label-md block mb-2">Relationships</span>
      {relationships.length > 0 && (
        <div className="space-y-3">
          {DISPLAY_TYPE_ORDER.filter((dt) => grouped.has(dt)).map((dt) => (
            <div key={dt}>
              <span className="text-fg-muted text-label-sm block mb-1">
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
                    className="group flex items-center gap-2 px-3 py-1.5 bg-surface-raised rounded-md border border-edge cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <span className="text-accent text-body-sm font-medium flex-shrink-0">
                      {rel.relatedTask.displayId}
                    </span>
                    <span className="text-fg text-body-sm truncate">{rel.relatedTask.title}</span>
                    <div className="flex-1" />
                    <TaskStatusBadge status={rel.relatedTask.status} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(rel.id);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      disabled={removing}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 text-fg-faint hover:text-error transition-all rounded"
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
        <div className="mt-2">
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
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="mt-2 text-fg-muted hover:text-fg text-label-md transition-colors inline-flex items-center gap-1"
        >
          <Plus className={iconSize.xs} />
          Add Relationship
        </button>
      )}
      {error && <p className="text-error text-label-sm mt-1">{error}</p>}
    </div>
  );
});
