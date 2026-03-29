/**
 * Bootstrap runner — discovers and executes `.orca/bootstrap` scripts
 * after a new worktree is created, before the agent PTY is spawned.
 */
import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskMetadata } from '../shared/daemon-protocol.js';
import { logger } from './logger.js';

const BOOTSTRAP_SCRIPT_PATH = join('.orca', 'bootstrap');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB retained for error reporting

interface BootstrapResult {
  success: boolean;
  durationMs: number;
  output: string;
  exitCode: number | null;
}

/**
 * Check for an executable `.orca/bootstrap` script in the worktree.
 * Returns the absolute path if found and executable, null otherwise.
 */
export async function findBootstrapScript(worktreePath: string): Promise<string | null> {
  const scriptPath = join(worktreePath, BOOTSTRAP_SCRIPT_PATH);
  try {
    await access(scriptPath, constants.X_OK);
    return scriptPath;
  } catch {
    return null;
  }
}

/**
 * Execute a bootstrap script in the worktree directory.
 * Captures stdout/stderr and enforces a timeout.
 */
export function runBootstrap(opts: {
  scriptPath: string;
  worktreePath: string;
  repoPath: string;
  metadata: TaskMetadata;
  timeoutMs?: number;
}): Promise<BootstrapResult> {
  const { scriptPath, worktreePath, repoPath, metadata } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const start = Date.now();
    let output = '';

    const child = spawn(scriptPath, [], {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Create a new process group so we can kill the entire tree on timeout
      detached: true,
      env: {
        ...process.env,
        ORCA_WORKTREE_PATH: worktreePath,
        ORCA_REPO_ROOT: repoPath,
        ORCA_TASK_ID: metadata.displayId,
        ORCA_TASK_TITLE: metadata.title,
        ORCA_PROJECT_NAME: metadata.projectName ?? '',
        ORCA_WORKSPACE_SLUG: metadata.workspaceSlug,
      },
    });

    const collectOutput = (data: Buffer) => {
      const text = data.toString();
      output += text;
      // Cap retained output to avoid unbounded memory growth on verbose scripts
      if (output.length > MAX_OUTPUT_BYTES) {
        output = output.slice(output.length - MAX_OUTPUT_BYTES);
      }
      for (const line of text.split('\n')) {
        if (line.trim()) logger.info(`bootstrap: ${line}`);
      }
    };

    child.stdout?.on('data', collectOutput);
    child.stderr?.on('data', collectOutput);

    const killProcessGroup = (signal: NodeJS.Signals) => {
      try {
        // Kill the entire process group (negative PID) so child processes are included
        process.kill(-child.pid!, signal);
      } catch {
        // Process may already be dead
      }
    };

    let sigkillTimer: ReturnType<typeof setTimeout> | null = null;

    const timer = setTimeout(() => {
      killProcessGroup('SIGTERM');
      sigkillTimer = setTimeout(() => killProcessGroup('SIGKILL'), 5000);
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
    };

    child.on('close', (exitCode) => {
      cleanup();
      const durationMs = Date.now() - start;

      if (exitCode === null) {
        logger.warn(`bootstrap.timeout worktreePath=${worktreePath} durationMs=${durationMs}`);
        resolve({ success: false, durationMs, output, exitCode: null });
      } else if (exitCode !== 0) {
        logger.warn(
          `bootstrap.failed worktreePath=${worktreePath} exitCode=${exitCode} durationMs=${durationMs}`,
        );
        resolve({ success: false, durationMs, output, exitCode });
      } else {
        logger.info(`bootstrap.success worktreePath=${worktreePath} durationMs=${durationMs}`);
        resolve({ success: true, durationMs, output, exitCode: 0 });
      }
    });

    child.on('error', (err) => {
      cleanup();
      const durationMs = Date.now() - start;
      logger.error(`bootstrap.error worktreePath=${worktreePath} error=${err.message}`);
      resolve({ success: false, durationMs, output: err.message, exitCode: null });
    });
  });
}
