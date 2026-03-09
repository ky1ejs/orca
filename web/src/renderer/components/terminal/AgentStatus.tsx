import { SessionStatus } from '../../../shared/session-status.js';

const statusConfig: Record<SessionStatus, { label: string; dotClass: string; badgeClass: string }> =
  {
    [SessionStatus.Starting]: {
      label: 'Starting',
      dotClass: 'bg-info animate-pulse',
      badgeClass: 'bg-info-muted text-info',
    },
    [SessionStatus.Running]: {
      label: 'Running',
      dotClass: 'bg-success',
      badgeClass: 'bg-success-muted text-success',
    },
    [SessionStatus.WaitingForInput]: {
      label: 'Waiting for Input',
      dotClass: 'bg-warning animate-pulse',
      badgeClass: 'bg-warning-muted text-warning',
    },
    [SessionStatus.AwaitingPermission]: {
      label: 'Needs Permission',
      dotClass: 'bg-orange-400 animate-pulse',
      badgeClass: 'bg-orange-900 text-orange-300',
    },
    [SessionStatus.Exited]: {
      label: 'Exited',
      dotClass: 'bg-gray-500',
      badgeClass: 'bg-gray-700 text-gray-300',
    },
    [SessionStatus.Error]: {
      label: 'Error',
      dotClass: 'bg-error',
      badgeClass: 'bg-error-muted text-error',
    },
  };

interface AgentStatusProps {
  status: string;
}

export function AgentStatus({ status }: AgentStatusProps) {
  const config = statusConfig[status as SessionStatus] ?? statusConfig[SessionStatus.Exited];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-label-sm font-medium ${config.badgeClass}`}
      data-testid="agent-status-badge"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
