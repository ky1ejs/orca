import { useState, useCallback } from 'react';

interface RemoveWorktreeModalProps {
  worktreePath: string;
  branchName: string;
  onRemove: (force: boolean) => Promise<void>;
  onClose: () => void;
}

export function RemoveWorktreeModal({
  worktreePath,
  branchName,
  onRemove,
  onClose,
}: RemoveWorktreeModalProps) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (force: boolean) => {
      setRemoving(true);
      try {
        await onRemove(force);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove worktree');
      } finally {
        setRemoving(false);
      }
    },
    [onRemove, onClose],
  );

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-modal-backdrop animate-fade-in">
      <div className="bg-surface-raised border border-edge-subtle rounded-lg p-6 max-w-md mx-4 shadow-modal animate-scale-in">
        <p className="text-fg text-body-sm mb-4">
          This will permanently remove the worktree at{' '}
          <code className="text-fg-muted font-mono bg-surface-inset px-1 rounded">
            {worktreePath}
          </code>{' '}
          and delete the local branch{' '}
          <code className="text-fg-muted font-mono bg-surface-inset px-1 rounded">
            {branchName}
          </code>
          . This cannot be undone.
        </p>
        {error && <p className="text-error text-body-sm mb-4">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={removing}
            className="px-3 py-1.5 text-label-md text-fg-muted hover:text-fg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {error && (error.includes('modified') || error.includes('untracked')) && (
            <button
              onClick={() => handleRemove(true)}
              disabled={removing}
              className="px-3 py-1.5 text-label-md bg-error-muted hover:bg-error-strong text-error rounded transition-colors disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Force remove'}
            </button>
          )}
          {!error && (
            <button
              onClick={() => handleRemove(false)}
              disabled={removing}
              className="px-3 py-1.5 text-label-md bg-error-muted hover:bg-error-strong text-error rounded transition-colors disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
