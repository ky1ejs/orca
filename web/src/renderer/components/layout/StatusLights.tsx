interface StatusLightsProps {
  daemon: boolean;
  mcpServer: boolean;
  backend: boolean;
}

function StatusDot({
  connected,
  label,
  showLabel = true,
}: {
  connected: boolean;
  label: string;
  showLabel?: boolean;
}) {
  return (
    <span
      className="flex items-center gap-1"
      title={`${label}: ${connected ? 'Connected' : 'Disconnected'}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-success' : 'bg-error'}`}
        data-testid={`status-dot-${label.toLowerCase()}`}
      />
      {showLabel && <span className="text-label-xs text-fg-faint">{label}</span>}
    </span>
  );
}

export function StatusLights({ daemon, mcpServer, backend }: StatusLightsProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5" data-testid="status-lights">
      <StatusDot connected={daemon} label="Daemon" />
      <StatusDot connected={mcpServer} label="MCP" />
      <StatusDot connected={backend} label="API" />
    </div>
  );
}

export function StatusLightsCollapsed({ daemon, mcpServer, backend }: StatusLightsProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 py-2"
      data-testid="status-lights-collapsed"
      title={`Daemon: ${daemon ? 'OK' : 'Down'}, MCP: ${mcpServer ? 'OK' : 'Down'}, API: ${backend ? 'OK' : 'Down'}`}
    >
      <StatusDot connected={daemon} label="Daemon" showLabel={false} />
      <StatusDot connected={mcpServer} label="MCP" showLabel={false} />
      <StatusDot connected={backend} label="API" showLabel={false} />
    </div>
  );
}
