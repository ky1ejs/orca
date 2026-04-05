import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../../workspace/context.js';
import {
  useWorkspaceIntegrations,
  useGitHubAppInstallUrl,
  useGitHubOAuthUrl,
  useCompleteGitHubInstallation,
  useRemoveGitHubInstallation,
  useUpdateObservedRepositories,
  useUpdateWorkspaceSettings,
} from '../../hooks/useGraphQL.js';

export function IntegrationsSettings() {
  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug ?? '';
  const { data } = useWorkspaceIntegrations(slug);
  const workspace = data?.workspace;
  const isOwner = workspace?.role === 'OWNER';

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      <GitHubConnectionSection
        workspaceId={workspace.id}
        installation={workspace.githubInstallation}
        isOwner={isOwner}
      />
      {isOwner && (
        <AutomationSettingsSection workspaceId={workspace.id} settings={workspace.settings} />
      )}
    </div>
  );
}

function GitHubConnectionSection({
  workspaceId,
  installation,
  isOwner,
}: {
  workspaceId: string;
  installation:
    | {
        id: string;
        installationId: number;
        accountLogin: string;
        accountType: string;
        repositories: string[];
        observedRepositories: string[];
      }
    | null
    | undefined;
  isOwner: boolean;
}) {
  const { data: urlData } = useGitHubAppInstallUrl(installation ? '' : workspaceId);
  const { data: oauthUrlData } = useGitHubOAuthUrl(installation ? '' : workspaceId);
  const { completeGitHubInstallation, fetching: completing } = useCompleteGitHubInstallation();
  const { removeGitHubInstallation, fetching: removing } = useRemoveGitHubInstallation();
  const { updateObservedRepositories } = useUpdateObservedRepositories();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [manualInstallationId, setManualInstallationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);

  // Listen for deep link callback from Electron
  useEffect(() => {
    if (!window.orca?.github) return;
    return window.orca.github.onInstallationCallback(async (data) => {
      if (data.workspaceId !== workspaceId) return;
      setError(null);
      const result = await completeGitHubInstallation(data.workspaceId, data.installationId);
      if (result.error) {
        setError(result.error.graphQLErrors?.[0]?.message ?? result.error.message);
      }
    });
  }, [workspaceId, completeGitHubInstallation]);

  const handleConnect = useCallback(() => {
    const url = urlData?.githubAppInstallUrl;
    if (url) {
      window.open(url, '_blank');
      // In browser dev mode (no window.orca), show manual input
      if (!window.orca?.github) {
        setShowManualInput(true);
      }
    }
  }, [urlData]);

  const handleUseExisting = useCallback(() => {
    const url = oauthUrlData?.githubOAuthUrl;
    if (url) {
      window.open(url, '_blank');
    }
  }, [oauthUrlData]);

  const handleManualComplete = useCallback(async () => {
    const id = Number(manualInstallationId.trim());
    if (!id || isNaN(id)) {
      setError('Please enter a valid installation ID.');
      return;
    }
    setError(null);
    const result = await completeGitHubInstallation(workspaceId, id);
    if (result.error) {
      setError(result.error.graphQLErrors?.[0]?.message ?? result.error.message);
    } else {
      setShowManualInput(false);
      setManualInstallationId('');
    }
  }, [workspaceId, manualInstallationId, completeGitHubInstallation]);

  const handleDisconnect = useCallback(async () => {
    const result = await removeGitHubInstallation(workspaceId);
    if (result.error) {
      setError(result.error.graphQLErrors?.[0]?.message ?? result.error.message);
    }
    setConfirmDisconnect(false);
  }, [workspaceId, removeGitHubInstallation]);

  const handleToggleRepo = useCallback(
    async (repo: string, checked: boolean) => {
      if (!installation) return;
      const current = installation.observedRepositories;
      const updated = checked ? [...current, repo] : current.filter((r) => r !== repo);
      setError(null);
      const result = await updateObservedRepositories(workspaceId, updated);
      if (result.error) {
        setError(result.error.graphQLErrors?.[0]?.message ?? result.error.message);
      }
    },
    [workspaceId, installation, updateObservedRepositories],
  );

  const isConfigured = !!urlData?.githubAppInstallUrl;

  return (
    <div>
      <h2 className="text-label-md font-medium text-fg mb-4">GitHub</h2>
      <div className="bg-surface-inset border border-edge-subtle rounded-lg p-4 space-y-4">
        {installation ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-label-md text-fg">{installation.accountLogin}</p>
                <p className="text-label-sm text-fg-muted">
                  {installation.accountType === 'Organization' ? 'Organization' : 'User'} account
                </p>
              </div>
              {isOwner && (
                <div>
                  {!confirmDisconnect ? (
                    <button
                      onClick={() => setConfirmDisconnect(true)}
                      className="px-3 py-1.5 text-label-sm text-error border border-error/30 hover:bg-error/10 rounded transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDisconnect}
                        disabled={removing}
                        className="px-3 py-1.5 text-label-sm bg-error-muted hover:bg-error-strong text-error rounded transition-colors disabled:opacity-50"
                      >
                        {removing ? 'Removing...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect(false)}
                        className="px-3 py-1.5 text-label-sm text-fg-muted hover:text-fg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {installation.repositories.length > 0 && (
              <div>
                <p className="text-label-sm text-fg-muted mb-2">Observed repositories</p>
                {installation.observedRepositories.length === 0 && (
                  <p className="text-body-sm text-fg-faint mb-2">
                    Select repositories to enable PR automation.
                  </p>
                )}
                <div className="space-y-1">
                  {installation.repositories.map((repo) => {
                    const observed = installation.observedRepositories.includes(repo);
                    return (
                      <label
                        key={repo}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-raised cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={observed}
                          onChange={(e) => handleToggleRepo(repo, e.target.checked)}
                          disabled={!isOwner}
                          className="accent-accent h-3.5 w-3.5"
                        />
                        <span className="text-label-sm text-fg">{repo}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-body-sm text-fg-muted">
              Connect a GitHub App to automatically link pull requests to tasks and enable PR-based
              automation.
            </p>
            {isOwner && isConfigured && (
              <div className="flex gap-2 items-center">
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded transition-colors"
                >
                  Connect GitHub
                </button>
                {oauthUrlData?.githubOAuthUrl && (
                  <button
                    onClick={handleUseExisting}
                    className="px-4 py-2 text-label-md text-fg-muted border border-edge-subtle hover:bg-surface-raised rounded transition-colors"
                  >
                    Use existing installation
                  </button>
                )}
              </div>
            )}
            {isOwner && !isConfigured && (
              <p className="text-body-sm text-fg-faint">
                GitHub App is not configured on the server. Set GITHUB_APP_SLUG to enable.
              </p>
            )}
            {!isOwner && (
              <p className="text-body-sm text-fg-faint">
                Only workspace owners can manage GitHub integrations.
              </p>
            )}
            {showManualInput && (
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={manualInstallationId}
                  onChange={(e) => setManualInstallationId(e.target.value)}
                  placeholder="Installation ID"
                  className="px-3 py-2 bg-surface-inset border border-edge-subtle rounded text-label-md text-fg placeholder-fg-faint focus:outline-none focus:border-edge-subtle w-48"
                />
                <button
                  onClick={handleManualComplete}
                  disabled={completing}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded transition-colors disabled:opacity-50"
                >
                  {completing ? 'Connecting...' : 'Complete Setup'}
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="text-body-sm text-error">{error}</p>}
      </div>
    </div>
  );
}

function AutomationSettingsSection({
  workspaceId,
  settings,
}: {
  workspaceId: string;
  settings: {
    autoCloseOnMerge: boolean;
    autoInReviewOnPrOpen: boolean;
    autoCleanupWorktree: boolean;
  };
}) {
  const { updateWorkspaceSettings } = useUpdateWorkspaceSettings();

  const handleToggle = useCallback(
    (
      field: 'autoCloseOnMerge' | 'autoInReviewOnPrOpen' | 'autoCleanupWorktree',
      value: boolean,
    ) => {
      updateWorkspaceSettings(workspaceId, { [field]: value });
    },
    [workspaceId, updateWorkspaceSettings],
  );

  return (
    <div>
      <h2 className="text-label-md font-medium text-fg mb-4">Automation</h2>
      <div className="bg-surface-inset border border-edge-subtle rounded-lg divide-y divide-edge-subtle">
        <ToggleRow
          label="Auto-close tasks when PRs merge"
          description="When all linked pull requests are merged, move the task to Done."
          checked={settings.autoCloseOnMerge}
          onChange={(v) => handleToggle('autoCloseOnMerge', v)}
        />
        <ToggleRow
          label="Auto-set In Review when PRs open"
          description="When a pull request is opened linking to a task, move it to In Review."
          checked={settings.autoInReviewOnPrOpen}
          onChange={(v) => handleToggle('autoInReviewOnPrOpen', v)}
        />
        <ToggleRow
          label="Auto-cleanup worktrees"
          description="When a task moves to Done and its worktree is safe to remove, automatically clean it up."
          checked={settings.autoCleanupWorktree}
          onChange={(v) => handleToggle('autoCleanupWorktree', v)}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="pr-4">
        <p className="text-label-md text-fg">{label}</p>
        <p className="text-label-sm text-fg-muted mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-raised border border-edge-subtle'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          } mt-0.5`}
        />
      </button>
    </div>
  );
}
