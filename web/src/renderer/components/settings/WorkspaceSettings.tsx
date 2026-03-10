import { useState, useCallback, type FormEvent } from 'react';
import { useWorkspace } from '../../workspace/context.js';
import { useUpdateWorkspace, useDeleteWorkspace } from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { MemberList } from '../members/MemberList.js';
import { TerminalSettings } from './TerminalSettings.js';
import { LabelManager } from '../labels/LabelManager.js';
import { AppearanceSettings } from './AppearanceSettings.js';
import { IntegrationsSettings } from './IntegrationsSettings.js';

type Tab = 'general' | 'members' | 'labels' | 'integrations' | 'terminal' | 'appearance';

export function WorkspaceSettings() {
  const { currentWorkspace, switchWorkspace } = useWorkspace();
  const { updateWorkspace, fetching: updating } = useUpdateWorkspace();
  const { deleteWorkspace, fetching: deleting } = useDeleteWorkspace();
  const { navigate } = useNavigation();

  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [name, setName] = useState(currentWorkspace?.name ?? '');
  const [slug, setSlug] = useState(currentWorkspace?.slug ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('Name is required.');
        return;
      }
      const trimmedSlug = slug.trim().toLowerCase();
      if (!trimmedSlug) {
        setError('Slug is required.');
        return;
      }
      if (!currentWorkspace) return;

      const input: { name: string; slug?: string } = { name: trimmedName };
      const slugChanged = trimmedSlug !== currentWorkspace.slug;
      if (slugChanged) {
        input.slug = trimmedSlug;
      }

      const result = await updateWorkspace(currentWorkspace.id, input);
      if (result.error) {
        const msg = result.error.graphQLErrors?.[0]?.message ?? result.error.message;
        setError(msg);
        return;
      }
      if (slugChanged) {
        switchWorkspace(trimmedSlug);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    },
    [name, slug, currentWorkspace, updateWorkspace, switchWorkspace],
  );

  const handleDelete = useCallback(async () => {
    if (!currentWorkspace) return;
    const result = await deleteWorkspace(currentWorkspace.id);
    if (result.error) {
      const msg = result.error.graphQLErrors?.[0]?.message ?? result.error.message;
      setError(msg);
      setConfirmDelete(false);
      return;
    }
    navigate({ view: 'projects' });
  }, [currentWorkspace, deleteWorkspace, navigate]);

  if (!currentWorkspace) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'members', label: 'Members' },
    { key: 'labels', label: 'Labels' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'terminal', label: 'Terminal' },
    { key: 'appearance', label: 'Appearance' },
  ];

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-heading-md font-semibold text-fg mb-6">Workspace Settings</h1>

      <div className="flex gap-4 border-b border-edge mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-2 text-label-md transition-colors ${
              activeTab === tab.key
                ? 'text-fg border-b-2 border-fg'
                : 'text-fg-muted hover:text-fg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-label-md text-fg-muted mb-1">Workspace Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded text-label-md text-fg placeholder-fg-faint focus:outline-none focus:border-edge-subtle"
              />
            </div>

            <div>
              <label className="block text-label-md text-fg-muted mb-1">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded text-label-md text-fg placeholder-fg-faint focus:outline-none focus:border-edge-subtle"
              />
              <p className="text-label-sm text-fg-faint mt-1">
                Lowercase letters, numbers, and hyphens. 3-64 characters. Changing this will update
                all task IDs.
              </p>
            </div>

            {error && <p className="text-body-sm text-error">{error}</p>}
            {success && <p className="text-body-sm text-success">Saved.</p>}

            <button
              type="submit"
              disabled={updating || !name.trim() || !slug.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded transition-colors disabled:opacity-50"
            >
              {updating ? 'Saving...' : 'Save'}
            </button>
          </form>

          <div className="mt-12 pt-6 border-t border-edge">
            <h3 className="text-label-md font-medium text-error mb-2">Danger Zone</h3>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-label-md text-error border border-error/30 hover:bg-error/10 rounded transition-colors"
              >
                Delete Workspace
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-body-sm text-fg-muted">
                  Are you sure? This cannot be undone.
                </span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 bg-error-muted hover:bg-error-strong text-error text-label-md rounded transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 text-label-md text-fg-muted hover:text-fg transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'members' && <MemberList />}

      {activeTab === 'labels' && <LabelManager />}

      {activeTab === 'integrations' && <IntegrationsSettings />}

      {activeTab === 'terminal' && <TerminalSettings />}

      {activeTab === 'appearance' && <AppearanceSettings />}
    </div>
  );
}
