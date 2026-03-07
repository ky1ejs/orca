import { BrowserWindow } from 'electron';
import { getActiveSessions, isPidAlive, updateSession } from '../db/sessions.js';

const SWEEP_INTERVAL_MS = 60_000; // 60 seconds

export class PidSweepManager {
  private interval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start periodic PID sweeps every 60 seconds.
   * Checks if tracked PIDs are still alive, marks dead ones as ERROR,
   * and notifies the renderer.
   */
  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this.sweep();
    }, SWEEP_INTERVAL_MS);
  }

  /**
   * Stop the periodic sweep.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Run a single sweep: check all active session PIDs and mark dead ones as ERROR.
   * Returns the IDs of sessions that were marked as dead.
   */
  sweep(): string[] {
    const activeSessions = getActiveSessions();
    const deadSessionIds: string[] = [];

    for (const session of activeSessions) {
      if (!isPidAlive(session.pid)) {
        updateSession(session.id, {
          status: 'ERROR',
          stoppedAt: new Date().toISOString(),
        });
        deadSessionIds.push(session.id);
      }
    }

    if (deadSessionIds.length > 0) {
      this.notifyRenderer(deadSessionIds);
    }

    return deadSessionIds;
  }

  private notifyRenderer(deadSessionIds: string[]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('pid-sweep:sessions-died', deadSessionIds);
    }
  }
}
