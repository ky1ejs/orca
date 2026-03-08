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
export const statusDotClass: Record<SessionStatus, string> = {
  [SessionStatus.Running]: 'bg-green-400',
  [SessionStatus.Exited]: 'bg-gray-500',
  [SessionStatus.Error]: 'bg-red-400',
  [SessionStatus.Starting]: 'bg-blue-400 animate-pulse',
  [SessionStatus.WaitingForInput]: 'bg-yellow-400 animate-pulse',
  [SessionStatus.AwaitingPermission]: 'bg-orange-400 animate-pulse',
};
