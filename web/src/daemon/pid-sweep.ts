/**
 * PID sweep for the daemon process.
 * Broadcasts dead sessions via callback instead of BrowserWindow.
 */
import { getActiveSessions, isPidAlive, updateSession } from './sessions.js';
import { SessionStatus } from '../shared/session-status.js';
import type { BroadcastFn } from './pty-manager.js';

const SWEEP_INTERVAL_MS = 60_000; // 60 seconds

export class DaemonPidSweepManager {
  private interval: ReturnType<typeof setInterval> | null = null;
  private broadcast: BroadcastFn;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
  }

  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this.sweep();
    }, SWEEP_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  sweep(): string[] {
    const activeSessions = getActiveSessions();
    const deadSessionIds: string[] = [];

    for (const session of activeSessions) {
      if (!isPidAlive(session.pid)) {
        updateSession(session.id, {
          status: SessionStatus.Error,
          stoppedAt: new Date().toISOString(),
        });
        deadSessionIds.push(session.id);
      }
    }

    if (deadSessionIds.length > 0) {
      this.broadcast('pid-sweep.sessions-died', { sessionIds: deadSessionIds });
    }

    return deadSessionIds;
  }
}
