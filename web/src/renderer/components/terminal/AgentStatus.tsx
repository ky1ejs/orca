import { SessionStatus, getStatusDotClasses } from '../../../shared/session-status.js';

const statusConfig: Record<SessionStatus, { label: string; badgeClass: string }> = {
  [SessionStatus.Starting]: {
    label: 'Starting',
    badgeClass: 'bg-info-muted text-info',
  },
  [SessionStatus.Running]: {
    label: 'Running',
    badgeClass: 'bg-success-muted text-success',
  },
  [SessionStatus.WaitingForInput]: {
    label: 'Waiting for Input',
    badgeClass: 'bg-warning-muted text-warning',
  },
  [SessionStatus.AwaitingPermission]: {
    label: 'Needs Permission',
    badgeClass: 'bg-orange-900 text-orange-300',
  },
  [SessionStatus.Exited]: {
    label: 'Exited',
    badgeClass: 'bg-gray-700 text-gray-300',
  },
  [SessionStatus.Error]: {
    label: 'Error',
    badgeClass: 'bg-error-muted text-error',
  },
};

interface AgentStatusProps {
  status: string;
  active?: boolean;
}

export function AgentStatus({ status, active = false }: AgentStatusProps) {
  const config = statusConfig[status as SessionStatus] ?? statusConfig[SessionStatus.Exited];
  const dotClass = getStatusDotClasses(status as SessionStatus, active);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-label-sm font-medium ${config.badgeClass}`}
      data-testid="agent-status-badge"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      {config.label}
    </span>
  );
}
