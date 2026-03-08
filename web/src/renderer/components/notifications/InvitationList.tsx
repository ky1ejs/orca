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

interface InvitationListProps {
  invitations: Invitation[];
}

export function InvitationList({ invitations }: InvitationListProps) {
  const { acceptInvitation } = useAcceptInvitation();
  const { declineInvitation } = useDeclineInvitation();
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAccept = useCallback(
    async (id: string) => {
      setProcessing(id);
      await acceptInvitation(id);
      setProcessing(null);
    },
    [acceptInvitation],
  );

  const handleDecline = useCallback(
    async (id: string) => {
      setProcessing(id);
      await declineInvitation(id);
      setProcessing(null);
    },
    [declineInvitation],
  );

  if (invitations.length === 0) {
    return <div className="px-3 py-4 text-sm text-gray-500">No pending invitations</div>;
  }

  return (
    <div className="max-h-64 overflow-y-auto">
      {invitations.map((inv) => (
        <div key={inv.id} className="px-3 py-2.5 border-b border-gray-700 last:border-b-0">
          <div className="text-sm font-medium text-white">{inv.workspace.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            Invited by {inv.invitedBy.name} as {inv.role}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleAccept(inv.id)}
              disabled={processing === inv.id}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => handleDecline(inv.id)}
              disabled={processing === inv.id}
              className="px-2.5 py-1 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
