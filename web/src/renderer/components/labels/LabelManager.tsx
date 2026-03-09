import { useState, useCallback } from 'react';
import {
  useLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
} from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';

export function LabelManager() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? '';
  const { data, fetching } = useLabels(workspaceId);
  const { createLabel } = useCreateLabel();
  const { updateLabel } = useUpdateLabel();
  const { deleteLabel } = useDeleteLabel();

  const labels = data?.labels ?? [];

  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!workspaceId || !name.trim()) return;
      setError(null);

      const result = await createLabel({ name: name.trim(), color, workspaceId });
      if (result.error) {
        setError(result.error.graphQLErrors[0]?.message ?? 'Failed to create label');
        return;
      }
      setName('');
      setColor('#6366F1');
    },
    [workspaceId, name, color, createLabel],
  );

  const handleUpdate = useCallback(
    async (id: string) => {
      setError(null);
      const input: { name?: string; color?: string } = {};
      if (editName.trim()) input.name = editName.trim();
      if (editColor) input.color = editColor;

      const result = await updateLabel(id, input);
      if (result.error) {
        setError(result.error.graphQLErrors[0]?.message ?? 'Failed to update label');
        return;
      }
      setEditingId(null);
    },
    [editName, editColor, updateLabel],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setError(null);
      const result = await deleteLabel(id);
      if (result.error) {
        setError(result.error.graphQLErrors[0]?.message ?? 'Failed to delete label');
      }
      setConfirmDeleteId(null);
    },
    [deleteLabel],
  );

  if (fetching && labels.length === 0) {
    return <p className="text-sm text-fg-muted p-8">Loading labels...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-xl font-semibold text-fg mb-1">Labels</h2>
      <p className="text-sm text-fg-muted mb-6">
        {labels.length} label{labels.length !== 1 ? 's' : ''}
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 bg-error-muted border border-error-strong rounded text-sm text-error">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-error hover:text-error">
            dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-6 flex gap-2 items-center">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label name"
          className="flex-1 bg-surface-inset border border-edge-subtle rounded px-3 py-1.5 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-edge-subtle"
          data-testid="label-name-input"
          required
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-8 bg-transparent border border-edge-subtle rounded cursor-pointer"
          data-testid="label-color-input"
        />
        <button
          type="submit"
          className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-sm rounded transition-colors"
          data-testid="label-create-button"
        >
          Create
        </button>
      </form>

      <div className="space-y-1">
        {labels.map((label) => (
          <div
            key={label.id}
            className="flex items-center justify-between px-3 py-2 rounded hover:bg-surface-overlay/50"
            data-testid={`label-row-${label.id}`}
          >
            {editingId === label.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-surface-inset border border-edge-subtle rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-edge-subtle"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdate(label.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-7 h-7 bg-transparent border border-edge-subtle rounded cursor-pointer"
                />
                <button
                  onClick={() => handleUpdate(label.id)}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-fg-faint hover:text-fg-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                    data-testid={`label-swatch-${label.id}`}
                  />
                  <span className="text-sm text-fg truncate">{label.name}</span>
                  <span className="text-xs text-fg-faint font-mono">{label.color}</span>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => {
                      setEditingId(label.id);
                      setEditName(label.name);
                      setEditColor(label.color);
                    }}
                    className="text-xs text-fg-faint hover:text-fg-muted transition-colors"
                    data-testid={`label-edit-${label.id}`}
                  >
                    Edit
                  </button>
                  {confirmDeleteId === label.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(label.id)}
                        className="text-xs text-error hover:text-error"
                        data-testid={`label-confirm-delete-${label.id}`}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-fg-faint hover:text-fg-muted"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(label.id)}
                      className="text-xs text-fg-faint hover:text-error transition-colors"
                      data-testid={`label-delete-${label.id}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
