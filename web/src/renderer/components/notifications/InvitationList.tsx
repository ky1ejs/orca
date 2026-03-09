import { useState, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { useAcceptInvitation, useDeclineInvitation } from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';

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
  const { switchWorkspace } = useWorkspace();
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAccept = useCallback(
    async (invitation: Invitation) => {
      setProcessing(invitation.id);
      await acceptInvitation(invitation.id);
      switchWorkspace(invitation.workspace.slug);
      setProcessing(null);
    },
    [acceptInvitation, switchWorkspace],
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
    return <div className="px-3 py-4 text-body-sm text-fg-faint">No pending invitations</div>;
  }

  return (
    <div className="max-h-64 overflow-y-auto">
      {invitations.map((inv) => (
        <div key={inv.id} className="px-3 py-2.5 border-b border-edge-subtle last:border-b-0">
          <div className="text-body-sm font-medium text-fg">{inv.workspace.name}</div>
          <div className="text-label-sm text-fg-muted mt-0.5">
            Invited by {inv.invitedBy.name} as {inv.role}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleAccept(inv)}
              disabled={processing === inv.id}
              className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-on-accent text-label-sm rounded transition-colors disabled:opacity-50 inline-flex items-center"
            >
              <Check className={`${iconSize.xs} mr-1`} />
              Accept
            </button>
            <button
              onClick={() => handleDecline(inv.id)}
              disabled={processing === inv.id}
              className="px-2.5 py-1 text-label-sm text-fg-muted hover:text-fg transition-colors disabled:opacity-50 inline-flex items-center"
            >
              <X className={`${iconSize.xs} mr-1`} />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
