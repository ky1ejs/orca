import { useState, useCallback, type FormEvent } from 'react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';
import { ApiKeyScope } from '../../graphql/__generated__/generated.js';

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
  [ApiKeyScope.TasksCreate]: 'Create tasks',
  [ApiKeyScope.TasksDeleteExternal]: 'Delete tasks it created for an external user',
};

const ALL_SCOPES = Object.keys(SCOPE_LABELS) as ApiKeyScope[];

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/**
 * Workspace owners create and revoke the keys other services use to call
 * Orca's public API. A new key is shown once and cannot be retrieved again.
 */
export function ApiKeysSettings() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? '';
  const { data, fetching, error: listError, refetch } = useApiKeys(workspaceId);
  const { createApiKey, fetching: creating } = useCreateApiKey();
  const { revokeApiKey } = useRevokeApiKey();

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([ApiKeyScope.TasksCreate]);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const apiKeys = data?.apiKeys ?? [];

  const toggleScope = useCallback((scope: ApiKeyScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );
  }, []);

  const handleCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      // A shown key must be dismissed first, so creating another can't replace it unseen.
      if (!workspaceId || !name.trim() || scopes.length === 0 || newKey) return;
      setError(null);

      const result = await createApiKey({ workspaceId, name: name.trim(), scopes });
      if (result.error || !result.data) {
        setError(result.error?.graphQLErrors[0]?.message ?? 'Failed to create API key');
        return;
      }
      setNewKey({ name: result.data.createApiKey.apiKey.name, key: result.data.createApiKey.key });
      setCopied(false);
      setName('');
      setScopes([ApiKeyScope.TasksCreate]);
      refetch({ requestPolicy: 'network-only' });
    },
    [workspaceId, name, scopes, newKey, createApiKey, refetch],
  );

  const handleCopy = useCallback(() => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.key).then(
      () => setCopied(true),
      () => setError('Could not copy. Select the key and copy it by hand.'),
    );
  }, [newKey]);

  const handleRevoke = useCallback(
    async (id: string) => {
      setError(null);
      setRevokingId(id);
      const result = await revokeApiKey(id);
      setRevokingId(null);
      if (result.error) {
        setError(result.error.graphQLErrors[0]?.message ?? 'Failed to revoke API key');
      }
      // Leave a confirmation the user opened for another key in the meantime.
      setConfirmRevokeId((current) => (current === id ? null : current));
      refetch({ requestPolicy: 'network-only' });
    },
    [revokeApiKey, refetch],
  );

  // Only before the first result: a refetch after creating a key must not
  // replace the panel, which would hide the one-time key.
  if (fetching && !data) {
    return <p className="text-sm text-fg-muted p-8">Loading API keys...</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-fg mb-1">API Keys</h2>
      <p className="text-sm text-fg-muted mb-6">
        Let another service call Orca&apos;s API for this workspace. A key acts for the workspace,
        not for a person, and can do only what its scopes allow.
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 bg-error-muted border border-error-strong rounded text-sm text-error">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-error hover:text-error">
            dismiss
          </button>
        </div>
      )}

      {newKey && (
        <div
          role="status"
          className="mb-6 p-4 border border-edge-subtle rounded bg-surface-inset"
          data-testid="api-key-created"
        >
          <p className="text-sm text-fg mb-2">
            Copy the key for <span className="font-medium">{newKey.name}</span> now. Orca
            doesn&apos;t store it and can&apos;t show it again.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              autoFocus
              value={newKey.key}
              onFocus={(e) => e.target.select()}
              aria-label="New API key"
              className="flex-1 font-mono text-code-sm bg-surface border border-edge-subtle rounded px-3 py-1.5 text-fg"
              data-testid="api-key-value"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-sm rounded transition-colors"
              data-testid="api-key-copy"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="px-3 py-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
              data-testid="api-key-done"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-8 space-y-3">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name, e.g. cut-api"
            maxLength={64}
            className="flex-1 bg-surface-inset border border-edge-subtle rounded px-3 py-1.5 text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-edge-subtle"
            data-testid="api-key-name-input"
            required
          />
          <button
            type="submit"
            disabled={creating || newKey !== null || !name.trim() || scopes.length === 0}
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-sm rounded transition-colors disabled:opacity-50"
            data-testid="api-key-create-button"
          >
            {creating ? 'Creating...' : 'Create key'}
          </button>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-label-sm text-fg-muted mb-1">Scopes</legend>
          {ALL_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggleScope(scope)}
                data-testid={`api-key-scope-${scope}`}
              />
              {SCOPE_LABELS[scope]}
            </label>
          ))}
        </fieldset>
        {newKey && (
          <p className="text-label-sm text-fg-faint">
            Press Done on the key above before creating another.
          </p>
        )}
      </form>

      {listError && !data ? (
        <p className="text-sm text-error" data-testid="api-key-list-error">
          Couldn&apos;t load API keys: {listError.graphQLErrors[0]?.message ?? listError.message}
        </p>
      ) : apiKeys.length === 0 ? (
        <p className="text-sm text-fg-muted">No API keys yet.</p>
      ) : (
        <ul className="space-y-1" data-testid="api-key-list">
          {apiKeys.map((apiKey) => {
            const isRevoked = apiKey.revokedAt != null;
            return (
              <li
                key={apiKey.id}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-surface-hover"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${isRevoked ? 'text-fg-faint' : 'text-fg'}`}>
                      {apiKey.name}
                    </span>
                    <span className="font-mono text-code-sm text-fg-faint">
                      …{apiKey.displayHint}
                    </span>
                    {isRevoked && <span className="text-label-sm text-fg-faint">Revoked</span>}
                  </div>
                  <p className="text-label-sm text-fg-faint">
                    {apiKey.scopes.map((scope) => SCOPE_LABELS[scope]).join(' · ')} · Created{' '}
                    {dateFormatter.format(new Date(apiKey.createdAt))}
                    {apiKey.createdBy ? ` by ${apiKey.createdBy.name}` : ''}
                  </p>
                </div>
                {!isRevoked &&
                  (confirmRevokeId === apiKey.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-label-sm text-fg-muted">
                        Services using it stop working.
                      </span>
                      <button
                        onClick={() => handleRevoke(apiKey.id)}
                        disabled={revokingId === apiKey.id}
                        className="px-2 py-1 bg-error-muted hover:bg-error-strong text-error text-label-sm rounded transition-colors disabled:opacity-50"
                        data-testid={`api-key-confirm-revoke-${apiKey.id}`}
                      >
                        {revokingId === apiKey.id ? 'Revoking...' : 'Revoke'}
                      </button>
                      <button
                        autoFocus
                        disabled={revokingId === apiKey.id}
                        onClick={() => setConfirmRevokeId(null)}
                        className="px-2 py-1 text-label-sm text-fg-muted hover:text-fg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRevokeId(apiKey.id)}
                      className="px-2 py-1 text-label-sm text-error hover:bg-error/10 rounded transition-colors"
                      data-testid={`api-key-revoke-${apiKey.id}`}
                    >
                      Revoke
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
