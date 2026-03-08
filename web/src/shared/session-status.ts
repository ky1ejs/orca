/**
 * Status values for terminal sessions (PTY processes).
 * Used across main process (DB, PTY management) and renderer (UI components).
 */
export enum SessionStatus {
  Starting = 'STARTING',
  Running = 'RUNNING',
  WaitingForInput = 'WAITING_FOR_INPUT',
  Exited = 'EXITED',
  Error = 'ERROR',
}

/** Statuses that indicate the session's process is still alive. */
export const ACTIVE_SESSION_STATUSES: readonly SessionStatus[] = [
  SessionStatus.Starting,
  SessionStatus.Running,
  SessionStatus.WaitingForInput,
];

export function isActiveSessionStatus(status: string): boolean {
  return (ACTIVE_SESSION_STATUSES as readonly string[]).includes(status);
}
