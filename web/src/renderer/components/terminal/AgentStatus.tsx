import { SessionStatus } from '../../../shared/session-status.js';

const statusConfig: Record<SessionStatus, { label: string; dotClass: string; badgeClass: string }> =
  {
    [SessionStatus.Starting]: {
      label: 'Starting',
      dotClass: 'bg-blue-400 animate-pulse',
      badgeClass: 'bg-blue-900 text-blue-300',
    },
    [SessionStatus.Running]: {
      label: 'Running',
      dotClass: 'bg-green-400',
      badgeClass: 'bg-green-900 text-green-300',
    },
    [SessionStatus.WaitingForInput]: {
      label: 'Waiting for Input',
      dotClass: 'bg-yellow-400 animate-pulse',
      badgeClass: 'bg-yellow-900 text-yellow-300',
    },
    [SessionStatus.Exited]: {
      label: 'Exited',
      dotClass: 'bg-gray-500',
      badgeClass: 'bg-gray-700 text-gray-300',
    },
    [SessionStatus.Error]: {
      label: 'Error',
      dotClass: 'bg-red-400',
      badgeClass: 'bg-red-900 text-red-300',
    },
  };

interface AgentStatusProps {
  status: string;
}

export function AgentStatus({ status }: AgentStatusProps) {
  const config = statusConfig[status as SessionStatus] ?? statusConfig[SessionStatus.Exited];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
      data-testid="agent-status-badge"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
