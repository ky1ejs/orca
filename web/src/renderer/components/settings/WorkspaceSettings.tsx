import { useState, useCallback, type FormEvent } from 'react';
import { useWorkspace } from '../../workspace/context.js';
import { useUpdateWorkspace, useDeleteWorkspace } from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { MemberList } from '../members/MemberList.js';

type Tab = 'general' | 'members';

export function WorkspaceSettings() {
  const { currentWorkspace } = useWorkspace();
  const { updateWorkspace, fetching: updating } = useUpdateWorkspace();
  const { deleteWorkspace, fetching: deleting } = useDeleteWorkspace();
  const { navigate } = useNavigation();

  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [name, setName] = useState(currentWorkspace?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      const trimmed = name.trim();
      if (!trimmed) {
        setError('Name is required.');
        return;
      }
      if (!currentWorkspace) return;

      const result = await updateWorkspace(currentWorkspace.id, { name: trimmed });
      if (result.error) {
        const msg = result.error.graphQLErrors?.[0]?.message ?? result.error.message;
        setError(msg);
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    },
    [name, currentWorkspace, updateWorkspace],
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
  ];

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-xl font-semibold text-white mb-6">Workspace Settings</h1>

      <div className="flex gap-4 border-b border-gray-800 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-2 text-sm transition-colors ${
              activeTab === tab.key
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
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
              <label className="block text-sm text-gray-300 mb-1">Workspace Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Slug</label>
              <input
                type="text"
                value={currentWorkspace.slug}
                disabled
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">Slug cannot be changed.</p>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {success && <p className="text-sm text-green-400">Saved.</p>}

            <button
              type="submit"
              disabled={updating || !name.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50"
            >
              {updating ? 'Saving...' : 'Save'}
            </button>
          </form>

          <div className="mt-12 pt-6 border-t border-gray-800">
            <h3 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h3>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-sm text-red-400 border border-red-400/30 hover:bg-red-400/10 rounded transition-colors"
              >
                Delete Workspace
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-300">Are you sure? This cannot be undone.</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'members' && <MemberList />}
    </div>
  );
}
