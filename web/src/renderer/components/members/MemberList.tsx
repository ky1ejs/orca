import { useState, useCallback } from 'react';
import { UserPlus, X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  useMe,
  useWorkspaceMembers,
  useAddMember,
  useRemoveMember,
  useUpdateMemberRole,
  useCancelInvitation,
} from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';
import type { WorkspaceRole } from '../../graphql/__generated__/generated.js';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-modal-backdrop animate-fade-in">
      <div className="bg-surface-raised border border-edge-subtle rounded-lg p-6 max-w-md mx-4 shadow-modal animate-scale-in">
        <p className="text-fg mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-label-md text-fg-muted hover:text-fg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-label-md bg-error-muted hover:bg-error-strong text-error rounded transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemberList() {
  const { currentWorkspace, currentRole } = useWorkspace();
  const { data: meData } = useMe();
  const currentUserId = meData?.me?.id;
  const { data, fetching, refetch } = useWorkspaceMembers(currentWorkspace?.slug ?? '');
  const { addMember } = useAddMember();
  const { removeMember } = useRemoveMember();
  const { updateMemberRole } = useUpdateMemberRole();
  const { cancelInvitation } = useCancelInvitation();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('MEMBER');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  const isOwner = currentRole === 'OWNER';
  const workspace = data?.workspace;
  const members = workspace?.members ?? [];
  const invitations = workspace?.invitations ?? [];

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const handleAddMember = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentWorkspace || !email.trim()) return;
      setError(null);

      const result = await addMember({
        workspaceId: currentWorkspace.id,
        email: email.trim(),
        role,
      });

      if (result.error) {
        setError(result.error.graphQLErrors[0]?.message ?? 'Failed to add member');
        return;
      }

      const data = result.data?.addMember;
      if (data) {
        const msg =
          'member' in data && data.member
            ? (data as { message: string }).message
            : 'invitation' in data && data.invitation
              ? (data as { message: string }).message
              : 'Member added';
        showMessage(msg);
      }

      setEmail('');
      setRole('MEMBER');
      refetch({ requestPolicy: 'network-only' });
    },
    [currentWorkspace, email, role, addMember, refetch, showMessage],
  );

  const handleRemoveMember = useCallback(
    (userId: string, userName: string, isSelf: boolean) => {
      if (!currentWorkspace) return;
      const msg = isSelf
        ? `Are you sure you want to leave ${currentWorkspace.name}? You will lose access to all projects and tasks.`
        : `Are you sure you want to remove ${userName} from ${currentWorkspace.name}? They will lose access to all projects and tasks.`;

      setConfirmAction({
        message: msg,
        action: async () => {
          const result = await removeMember(currentWorkspace.id, userId);
          if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? 'Failed to remove member');
          } else {
            showMessage(
              isSelf
                ? `You have left ${currentWorkspace.name}`
                : `${userName} has been removed from ${currentWorkspace.name}`,
            );
            refetch({ requestPolicy: 'network-only' });
          }
          setConfirmAction(null);
        },
      });
    },
    [currentWorkspace, removeMember, refetch, showMessage],
  );

  const handleUpdateRole = useCallback(
    async (userId: string, userName: string, newRole: WorkspaceRole) => {
      if (!currentWorkspace) return;
      const result = await updateMemberRole({
        workspaceId: currentWorkspace.id,
        userId,
        role: newRole,
      });
      if (result.error) {
        setError(result.error.graphQLErrors[0]?.message ?? 'Failed to update role');
      } else {
        showMessage(`${userName} is now ${newRole}`);
        refetch({ requestPolicy: 'network-only' });
      }
    },
    [currentWorkspace, updateMemberRole, refetch, showMessage],
  );

  const handleCancelInvitation = useCallback(
    (invitationId: string, invEmail: string) => {
      setConfirmAction({
        message: `Are you sure you want to cancel the invitation to ${invEmail}?`,
        action: async () => {
          const result = await cancelInvitation(invitationId);
          if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? 'Failed to cancel invitation');
          } else {
            showMessage(`Invitation to ${invEmail} cancelled`);
            refetch({ requestPolicy: 'network-only' });
          }
          setConfirmAction(null);
        },
      });
    },
    [cancelInvitation, refetch, showMessage],
  );

  if (fetching && !workspace) {
    return (
      <div className="p-8 text-fg-muted">
        <p className="text-body-sm">Loading members...</p>
      </div>
    );
  }

  const ownerCount = members.filter((m) => m.role === 'OWNER').length;

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-heading-md font-semibold text-fg mb-1">Members</h2>
      <p className="text-body-sm text-fg-muted mb-6">
        {members.length} member{members.length !== 1 ? 's' : ''}
      </p>

      {message && (
        <div className="mb-4 px-3 py-2 bg-success-muted border border-success-strong rounded text-body-sm text-success">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 bg-error-muted border border-error-strong rounded text-body-sm text-error">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-error hover:text-error">
            <X className={iconSize.sm} />
          </button>
        </div>
      )}

      {isOwner && (
        <form onSubmit={handleAddMember} className="mb-8 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="flex-1 bg-surface-inset border border-edge-subtle rounded px-3 py-1.5 text-label-md text-fg placeholder-fg-faint focus:outline-none focus:border-edge-subtle"
            required
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            className="bg-surface-inset border border-edge-subtle rounded px-3 py-1.5 text-label-md text-fg focus:outline-none focus:border-edge-subtle"
          >
            <option value="MEMBER">Member</option>
            <option value="OWNER">Owner</option>
          </select>
          <button
            type="submit"
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded transition-colors inline-flex items-center"
          >
            <UserPlus className={`${iconSize.sm} mr-1`} />
            Add
          </button>
        </form>
      )}

      <div className="space-y-1">
        {members.map((member) => {
          const isLastOwner = member.role === 'OWNER' && ownerCount <= 1;

          return (
            <div
              key={member.id}
              className="flex items-center justify-between px-3 py-2 rounded hover:bg-surface-overlay/50"
            >
              <div className="flex-1 min-w-0">
                <div className="text-body-sm text-fg truncate">{member.user.name}</div>
                <div className="text-label-sm text-fg-faint truncate">{member.user.email}</div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {isOwner && member.user.id !== currentUserId ? (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleUpdateRole(
                        member.user.id,
                        member.user.name,
                        e.target.value as WorkspaceRole,
                      )
                    }
                    disabled={isLastOwner}
                    className="bg-surface-inset border border-edge-subtle rounded px-2 py-1 text-label-sm text-fg disabled:opacity-50"
                  >
                    <option value="OWNER">Owner</option>
                    <option value="MEMBER">Member</option>
                  </select>
                ) : (
                  <span
                    className={`text-label-sm px-2 py-0.5 rounded ${
                      member.role === 'OWNER'
                        ? 'bg-warning-muted text-warning'
                        : 'bg-surface-inset text-fg-muted'
                    }`}
                  >
                    {member.role}
                  </span>
                )}
                {(isOwner || member.user.id === currentUserId) && !isLastOwner && (
                  <button
                    onClick={() =>
                      handleRemoveMember(
                        member.user.id,
                        member.user.name,
                        member.user.id === currentUserId,
                      )
                    }
                    className="text-label-sm text-fg-faint hover:text-error transition-colors"
                  >
                    {member.user.id === currentUserId ? 'Leave' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isOwner && invitations.length > 0 && (
        <>
          <h3 className="text-label-md font-medium text-fg-muted mt-8 mb-3">Pending Invitations</h3>
          <div className="space-y-1">
            {invitations.map((inv) => {
              const expiresAt = new Date(inv.expiresAt);
              const now = new Date();
              const daysLeft = Math.max(
                0,
                Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
              );

              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-3 py-2 rounded hover:bg-surface-overlay/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm text-fg-muted truncate">{inv.email}</div>
                    <div className="text-label-sm text-fg-faint">
                      {inv.role} &middot; Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelInvitation(inv.id, inv.email)}
                    className="text-label-sm text-fg-faint hover:text-error transition-colors ml-4"
                  >
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
