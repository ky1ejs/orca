/**
 * Heartbeat monitor: periodically pings the daemon to detect unresponsive states.
 * If 3 consecutive pings fail, triggers the onFailure callback (typically a restart).
 */
import { DAEMON_METHODS } from '../../shared/daemon-protocol.js';
import { logger } from '../logger.js';
import type { DaemonClient } from './client.js';

const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const MAX_MISSED_HEARTBEATS = 3;

export class HeartbeatMonitor {
  private client: DaemonClient;
  private onFailure: () => void;
  private interval: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private pending = false;

  constructor(client: DaemonClient, onFailure: () => void) {
    this.client = client;
    this.onFailure = onFailure;
  }

  start(): void {
    this.stop();
    this.interval = setInterval(() => this.ping(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.consecutiveFailures = 0;
    this.pending = false;
  }

  private async ping(): Promise<void> {
    if (this.pending) return;
    this.pending = true;

    const timeout = rejectAfter(HEARTBEAT_TIMEOUT_MS);
    try {
      await Promise.race([
        this.client.request(DAEMON_METHODS.DAEMON_PING),
        timeout.promise,
      ]);
      this.consecutiveFailures = 0;
    } catch {
      this.consecutiveFailures++;
      logger.warn(`Daemon heartbeat missed (${this.consecutiveFailures}/${MAX_MISSED_HEARTBEATS})`);

      if (this.consecutiveFailures >= MAX_MISSED_HEARTBEATS) {
        logger.error('Daemon unresponsive — triggering restart');
        this.stop();
        this.onFailure();
        return;
      }
    } finally {
      timeout.cancel();
      this.pending = false;
    }
  }
}

function rejectAfter(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Heartbeat timeout')), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}
