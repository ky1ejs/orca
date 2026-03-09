import { useState } from 'react';

interface ProtocolUpdateDialogProps {
  activeSessions: number;
  onConfirm: () => void;
}

export function ProtocolUpdateDialog({ activeSessions, onConfirm }: ProtocolUpdateDialogProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <h2 className="text-heading-sm text-white">Update requires restart</h2>
        <p className="mt-3 text-body-sm text-gray-300">
          This update includes changes that require restarting the terminal daemon. You have{' '}
          <span className="font-semibold text-white">
            {activeSessions} active session{activeSessions === 1 ? '' : 's'}
          </span>{' '}
          that will be terminated.
        </p>
        <p className="mt-2 text-body-sm text-gray-400">
          You can continue using the app, but new terminal features won&apos;t work until the daemon
          is restarted.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={restarting}
              className="rounded-md bg-error/10 px-4 py-2 text-body-sm font-medium text-error hover:bg-error/20 disabled:opacity-50"
            >
              Close sessions &amp; restart
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={restarting}
                className="rounded-md px-4 py-2 text-body-sm text-gray-400 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="rounded-md bg-error px-4 py-2 text-body-sm font-medium text-white hover:bg-error/80 disabled:opacity-50"
              >
                {restarting
                  ? 'Restarting...'
                  : `Terminate ${activeSessions} session${activeSessions === 1 ? '' : 's'} & restart`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
