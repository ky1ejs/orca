const statusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  STARTING: {
    label: 'Starting',
    dotClass: 'bg-blue-400 animate-pulse',
    badgeClass: 'bg-blue-900 text-blue-300',
  },
  RUNNING: {
    label: 'Running',
    dotClass: 'bg-green-400',
    badgeClass: 'bg-green-900 text-green-300',
  },
  WAITING_FOR_INPUT: {
    label: 'Waiting for Input',
    dotClass: 'bg-yellow-400 animate-pulse',
    badgeClass: 'bg-yellow-900 text-yellow-300',
  },
  EXITED: {
    label: 'Exited',
    dotClass: 'bg-gray-500',
    badgeClass: 'bg-gray-700 text-gray-300',
  },
  ERROR: {
    label: 'Error',
    dotClass: 'bg-red-400',
    badgeClass: 'bg-red-900 text-red-300',
  },
};

interface AgentStatusProps {
  status: string;
}

export function AgentStatus({ status }: AgentStatusProps) {
  const config = statusConfig[status] ?? statusConfig.EXITED;
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
