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
    return <p className="text-sm text-gray-400 p-8">Loading labels...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-xl font-semibold text-white mb-1">Labels</h2>
      <p className="text-sm text-gray-400 mb-6">
        {labels.length} label{labels.length !== 1 ? 's' : ''}
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">
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
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus-ring"
          data-testid="label-name-input"
          required
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-8 bg-transparent border border-gray-700 rounded cursor-pointer"
          data-testid="label-color-input"
        />
        <button
          type="submit"
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          data-testid="label-create-button"
        >
          Create
        </button>
      </form>

      <div className="space-y-1">
        {labels.map((label) => (
          <div
            key={label.id}
            className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-800/50"
            data-testid={`label-row-${label.id}`}
          >
            {editingId === label.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus-ring"
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
                  className="w-7 h-7 bg-transparent border border-gray-700 rounded cursor-pointer"
                />
                <button
                  onClick={() => handleUpdate(label.id)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-gray-500 hover:text-gray-300"
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
                  <span className="text-sm text-white truncate">{label.name}</span>
                  <span className="text-code-xs text-gray-500 font-mono">{label.color}</span>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => {
                      setEditingId(label.id);
                      setEditName(label.name);
                      setEditColor(label.color);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    data-testid={`label-edit-${label.id}`}
                  >
                    Edit
                  </button>
                  {confirmDeleteId === label.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(label.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                        data-testid={`label-confirm-delete-${label.id}`}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(label.id)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors"
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
