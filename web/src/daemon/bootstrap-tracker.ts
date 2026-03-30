/**
 * In-memory tracker for in-flight bootstrap processes.
 *
 * Provides deduplication (two launches for the same worktree share one bootstrap),
 * output buffering with throttled broadcasting, and lock file management for
 * cross-process safety (survives daemon crashes).
 */
import type { BroadcastFn } from './pty-manager.js';
import type { TaskMetadata } from '../shared/daemon-protocol.js';
import { DAEMON_EVENTS } from '../shared/daemon-protocol.js';
import type { ScriptResult } from './bootstrap-runner.js';
import {
  runBootstrap,
  markBootstrapped,
  acquireBootstrapLock,
  releaseBootstrapLock,
  isBootstrapLocked,
} from './bootstrap-runner.js';
import { logger } from './logger.js';

/** Max output lines retained per bootstrap for UI display. */
const MAX_OUTPUT_LINES = 500;

/** Minimum interval (ms) between BOOTSTRAP_OUTPUT broadcasts. */
const OUTPUT_BROADCAST_INTERVAL_MS = 200;

interface BootstrapEntry {
  promise: Promise<ScriptResult>;
  lines: string[];
}

export class BootstrapTracker {
  private running = new Map<string, BootstrapEntry>();

  /**
   * Start a bootstrap for the given worktree. If one is already running
   * (in-memory or via lock file), this is a no-op.
   */
  start(opts: {
    scriptPath: string;
    worktreePath: string;
    repoPath: string;
    metadata: TaskMetadata;
    broadcast: BroadcastFn;
  }): void {
    const { scriptPath, worktreePath, repoPath, metadata, broadcast } = opts;

    // Dedup: already tracked in-memory
    if (this.running.has(worktreePath)) return;

    // Another process owns this bootstrap (daemon crashed, child survived)
    if (isBootstrapLocked(worktreePath)) return;

    const lines: string[] = [];
    let pendingLines: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushOutput = () => {
      flushTimer = null;
      if (pendingLines.length > 0) {
        broadcast(DAEMON_EVENTS.BOOTSTRAP_OUTPUT, {
          worktreePath,
          lines: pendingLines,
        });
        pendingLines = [];
      }
    };

    const onOutput = (line: string) => {
      lines.push(line);
      if (lines.length > MAX_OUTPUT_LINES) {
        lines.splice(0, lines.length - MAX_OUTPUT_LINES);
      }
      pendingLines.push(line);
      // Throttle broadcasts
      if (!flushTimer) {
        flushTimer = setTimeout(flushOutput, OUTPUT_BROADCAST_INTERVAL_MS);
      }
    };

    const onSpawned = (pid: number) => {
      acquireBootstrapLock(worktreePath, pid);
    };

    const promise = runBootstrap({
      scriptPath,
      worktreePath,
      repoPath,
      metadata,
      onOutput,
      onSpawned,
    }).then((result) => {
      // Flush any remaining output
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingLines.length > 0) {
        broadcast(DAEMON_EVENTS.BOOTSTRAP_OUTPUT, {
          worktreePath,
          lines: pendingLines,
        });
        pendingLines = [];
      }

      releaseBootstrapLock(worktreePath);
      this.running.delete(worktreePath);

      if (result.success) {
        markBootstrapped(worktreePath);
        broadcast(DAEMON_EVENTS.BOOTSTRAP_COMPLETED, { worktreePath });
        logger.info(`bootstrap-tracker: completed worktreePath=${worktreePath}`);
      } else {
        broadcast(DAEMON_EVENTS.BOOTSTRAP_FAILED, {
          worktreePath,
          error: result.output.slice(-2000),
        });
        logger.warn(
          `bootstrap-tracker: failed worktreePath=${worktreePath} exitCode=${result.exitCode} timedOut=${result.timedOut}`,
        );
      }

      return result;
    });

    this.running.set(worktreePath, { promise, lines });
    logger.info(`bootstrap-tracker: started worktreePath=${worktreePath}`);
  }

  /** Check if a bootstrap is currently in-flight for this worktree. */
  isRunning(worktreePath: string): boolean {
    return this.running.has(worktreePath);
  }

  /** Wait for an in-flight bootstrap. Returns null if none is running. */
  async waitFor(worktreePath: string): Promise<ScriptResult | null> {
    const entry = this.running.get(worktreePath);
    if (!entry) return null;
    return entry.promise;
  }

  /** Get cached output lines for a running bootstrap. */
  getOutput(worktreePath: string): string[] {
    return this.running.get(worktreePath)?.lines ?? [];
  }

  /** Number of in-flight bootstraps (used by idle manager). */
  activeCount(): number {
    return this.running.size;
  }

  /** Clean up on daemon shutdown. */
  dispose(): void {
    this.running.clear();
  }
}
