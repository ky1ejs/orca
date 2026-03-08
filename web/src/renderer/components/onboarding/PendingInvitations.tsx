import { useState, useCallback } from 'react';
import { useAcceptInvitation, useDeclineInvitation } from '../../hooks/useGraphQL.js';

interface Invitation {
  id: string;
  email: string;
  role: string;
  workspace: { id: string; name: string; slug: string };
  invitedBy: { id: string; name: string };
  expiresAt: string;
}

interface PendingInvitationsProps {
  invitations: Invitation[];
  onComplete: () => void;
}

export function PendingInvitations({ invitations, onComplete }: PendingInvitationsProps) {
  const { acceptInvitation } = useAcceptInvitation();
  const { declineInvitation } = useDeclineInvitation();
  const [processed, setProcessed] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAccept = useCallback(
    async (id: string) => {
      setProcessing(id);
      await acceptInvitation(id);
      setProcessed((prev) => new Set(prev).add(id));
      setProcessing(null);
    },
    [acceptInvitation],
  );

  const handleDecline = useCallback(
    async (id: string) => {
      setProcessing(id);
      await declineInvitation(id);
      setProcessed((prev) => new Set(prev).add(id));
      setProcessing(null);
    },
    [declineInvitation],
  );

  const remaining = invitations.filter((inv) => !processed.has(inv.id));

  return (
    <div className="flex h-full items-center justify-center bg-gray-950 text-gray-100">
      <div className="max-w-md w-full mx-auto p-8">
        <h2 className="text-xl font-semibold text-white mb-2">You've been invited!</h2>
        <p className="text-sm text-gray-400 mb-6">
          You have pending workspace invitations. Would you like to join?
        </p>

        <div className="space-y-3 mb-6">
          {remaining.map((inv) => (
            <div key={inv.id} className="border border-gray-700 rounded-lg p-4 bg-gray-900">
              <div className="font-medium text-white">{inv.workspace.name}</div>
              <div className="text-sm text-gray-400 mt-1">
                Invited by {inv.invitedBy.name} as {inv.role}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleAccept(inv.id)}
                  disabled={processing === inv.id}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(inv.id)}
                  disabled={processing === inv.id}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>

        {remaining.length === 0 && (
          <p className="text-sm text-gray-400 mb-6">All invitations processed.</p>
        )}

        <button
          onClick={onComplete}
          className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
