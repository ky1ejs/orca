/**
 * Status values for terminal sessions (PTY processes).
 * Used across main process (DB, PTY management) and renderer (UI components).
 */
export enum SessionStatus {
  Starting = 'STARTING',
  Running = 'RUNNING',
  WaitingForInput = 'WAITING_FOR_INPUT',
  AwaitingPermission = 'AWAITING_PERMISSION',
  Exited = 'EXITED',
  Error = 'ERROR',
}

/** Statuses that indicate the session's process is still alive. */
export const ACTIVE_SESSION_STATUSES: readonly SessionStatus[] = [
  SessionStatus.Starting,
  SessionStatus.Running,
  SessionStatus.WaitingForInput,
  SessionStatus.AwaitingPermission,
];

export function isActiveSessionStatus(status: string): boolean {
  return (ACTIVE_SESSION_STATUSES as readonly string[]).includes(status);
}

/** CSS classes for status indicator dots. */
const statusDotClass: Record<SessionStatus, string> = {
  [SessionStatus.Running]: 'bg-success',
  [SessionStatus.Exited]: 'bg-gray-500',
  [SessionStatus.Error]: 'bg-error',
  [SessionStatus.Starting]: 'bg-info animate-pulse',
  [SessionStatus.WaitingForInput]: 'bg-warning animate-pulse',
  [SessionStatus.AwaitingPermission]: 'bg-warning animate-pulse',
};

/** CSS glow class applied when a session has recent PTY output activity. */
const statusGlowClass: Record<SessionStatus, string> = {
  [SessionStatus.Running]: 'glow-success',
  [SessionStatus.Starting]: 'glow-info',
  [SessionStatus.WaitingForInput]: 'glow-warning',
  [SessionStatus.AwaitingPermission]: 'glow-orange',
  [SessionStatus.Exited]: '',
  [SessionStatus.Error]: '',
};

/** Combine base dot classes with optional glow. */
export function getStatusDotClasses(status: SessionStatus, active: boolean): string {
  const base = statusDotClass[status] ?? 'bg-gray-500';
  if (!active) return base;
  const glow = statusGlowClass[status] ?? '';
  return glow ? `${base} ${glow}` : base;
}
