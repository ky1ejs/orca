import { useState, useRef, useCallback, type FormEvent } from 'react';
import { useCreateWorkspace } from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';
import { useNavigation } from '../../navigation/context.js';

interface CreateWorkspaceModalProps {
  onClose: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function CreateWorkspaceModal({ onClose }: CreateWorkspaceModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { createWorkspace, fetching } = useCreateWorkspace();
  const { switchWorkspace } = useWorkspace();
  const { navigate } = useNavigation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  };

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      const trimmedSlug = slug.trim();

      if (!trimmedName || !trimmedSlug) {
        setError('Name and slug are required.');
        return;
      }

      const result = await createWorkspace({ name: trimmedName, slug: trimmedSlug });

      if (result.error) {
        const msg = result.error.graphQLErrors?.[0]?.message ?? result.error.message;
        setError(msg);
        return;
      }

      const newSlug = result.data?.createWorkspace?.slug;
      if (newSlug) {
        switchWorkspace(newSlug);
        navigate({ view: 'projects' });
      }
      onClose();
    },
    [name, slug, createWorkspace, switchWorkspace, navigate, onClose],
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-surface-overlay animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-surface-primary border border-gray-700 rounded-lg shadow-modal w-full max-w-md p-6 animate-scale-in"
      >
        <h2 className="text-heading-sm font-semibold text-white mb-4">Create Workspace</h2>

        <label className="block text-label-md text-gray-300 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-label-md text-white placeholder-gray-500 focus-ring mb-3"
          placeholder="My Workspace"
          autoFocus
        />

        <label className="block text-label-md text-gray-300 mb-1">Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-label-md text-white placeholder-gray-500 focus-ring mb-4"
          placeholder="my-workspace"
        />

        {error && <p className="text-body-sm text-error mb-4">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-label-md text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={fetching || !name.trim() || !slug.trim()}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded transition-colors disabled:opacity-50"
          >
            {fetching ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
