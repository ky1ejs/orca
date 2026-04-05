/**
 * Script runner — discovers and executes `.orca/bootstrap` and `.orca/teardown`
 * scripts for worktree lifecycle management.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskMetadata } from '../shared/daemon-protocol.js';
import { isPidAlive } from './sessions.js';
import { logger } from './logger.js';

const BOOTSTRAP_SCRIPT_PATH = join('.orca', 'bootstrap');
const PRE_TERMINAL_SCRIPT_PATH = join('.orca', 'pre-terminal');
const TEARDOWN_SCRIPT_PATH = join('.orca', 'teardown');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const PRE_TERMINAL_TIMEOUT_MS = 30 * 1000; // 30 seconds
const TEARDOWN_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const MAX_OUTPUT_CHARS = 64 * 1024; // 64K characters retained for error reporting

export interface ScriptResult {
  success: boolean;
  durationMs: number;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

// ─── Bootstrap Marker & Lock ──────────────────────────────────────

function hashFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/** Check if bootstrap has completed AND the script hasn't changed since. */
export function isBootstrapped(worktreePath: string): boolean {
  let storedHash: string;
  try {
    storedHash = readFileSync(join(worktreePath, '.orca', '.bootstrapped'), 'utf-8').trim();
  } catch {
    return false;
  }
  const currentHash = hashFile(join(worktreePath, '.orca', 'bootstrap'));
  if (currentHash === null) return true; // no script = nothing to run
  return storedHash === currentHash;
}

/** Mark bootstrap as complete, recording the script hash for change detection. */
export function markBootstrapped(worktreePath: string): void {
  const orcaDir = join(worktreePath, '.orca');
  if (!existsSync(orcaDir)) mkdirSync(orcaDir, { recursive: true });
  const hash = hashFile(join(orcaDir, 'bootstrap')) ?? 'none';
  writeFileSync(join(orcaDir, '.bootstrapped'), hash);
}

/** Check if another bootstrap process is already running (survives daemon crashes). */
export function isBootstrapLocked(worktreePath: string): boolean {
  let pidStr: string;
  try {
    pidStr = readFileSync(join(worktreePath, '.orca', '.bootstrap.lock'), 'utf-8').trim();
  } catch {
    return false; // no lock file
  }
  const pid = parseInt(pidStr, 10);
  if (isPidAlive(pid)) return true;
  // Process is dead — stale lock
  try {
    unlinkSync(join(worktreePath, '.orca', '.bootstrap.lock'));
  } catch {
    // Ignore removal errors
  }
  return false;
}

export function acquireBootstrapLock(worktreePath: string, pid: number): void {
  writeFileSync(join(worktreePath, '.orca', '.bootstrap.lock'), String(pid));
}

export function releaseBootstrapLock(worktreePath: string): void {
  try {
    unlinkSync(join(worktreePath, '.orca', '.bootstrap.lock'));
  } catch {
    // Ignore — file may already be gone
  }
}

// ─── Script Discovery ──────────────────────────────────────────────

async function findScript(worktreePath: string, relativePath: string): Promise<string | null> {
  const scriptPath = join(worktreePath, relativePath);
  try {
    await access(scriptPath, constants.X_OK);
    return scriptPath;
  } catch {
    return null;
  }
}

export function findBootstrapScript(worktreePath: string): Promise<string | null> {
  return findScript(worktreePath, BOOTSTRAP_SCRIPT_PATH);
}

export function findPreTerminalScript(worktreePath: string): Promise<string | null> {
  return findScript(worktreePath, PRE_TERMINAL_SCRIPT_PATH);
}

export function findTeardownScript(worktreePath: string): Promise<string | null> {
  return findScript(worktreePath, TEARDOWN_SCRIPT_PATH);
}

// ─── Script Execution ──────────────────────────────────────────────

function runScript(opts: {
  scriptPath: string;
  worktreePath: string;
  repoPath: string;
  env?: Record<string, string>;
  timeoutMs: number;
  logPrefix: string;
  onOutput?: (line: string) => void;
  onSpawned?: (pid: number) => void;
}): Promise<ScriptResult> {
  const { scriptPath, worktreePath, repoPath, timeoutMs, logPrefix } = opts;

  return new Promise((resolve) => {
    const start = Date.now();
    let output = '';
    let timedOut = false;

    const child = spawn(scriptPath, [], {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: {
        ...process.env,
        ORCA_WORKTREE_PATH: worktreePath,
        ORCA_REPO_ROOT: repoPath,
        ...opts.env,
      },
    });

    if (child.pid) opts.onSpawned?.(child.pid);

    const collectOutput = (data: Buffer) => {
      const text = data.toString();
      output += text;
      if (output.length > MAX_OUTPUT_CHARS) {
        output = output.slice(output.length - MAX_OUTPUT_CHARS);
      }
      for (const line of text.split('\n')) {
        if (line.trim()) {
          logger.debug(`${logPrefix}: ${line}`);
          opts.onOutput?.(line);
        }
      }
    };

    child.stdout?.on('data', collectOutput);
    child.stderr?.on('data', collectOutput);

    const killProcessGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, signal);
      } catch {
        // Process may already be dead
      }
    };

    let sigkillTimer: ReturnType<typeof setTimeout> | null = null;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup('SIGTERM');
      sigkillTimer = setTimeout(() => killProcessGroup('SIGKILL'), 5000);
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
    };

    child.on('close', (exitCode, signal) => {
      cleanup();
      const durationMs = Date.now() - start;

      if (timedOut) {
        logger.warn(`${logPrefix}.timeout worktreePath=${worktreePath} durationMs=${durationMs}`);
        resolve({ success: false, durationMs, output, exitCode: null, timedOut: true });
      } else if (signal) {
        logger.warn(
          `${logPrefix}.killed worktreePath=${worktreePath} signal=${signal} durationMs=${durationMs}`,
        );
        resolve({ success: false, durationMs, output, exitCode: null, timedOut: false });
      } else if (exitCode !== 0) {
        logger.warn(
          `${logPrefix}.failed worktreePath=${worktreePath} exitCode=${exitCode} durationMs=${durationMs}`,
        );
        resolve({ success: false, durationMs, output, exitCode, timedOut: false });
      } else {
        logger.info(`${logPrefix}.success worktreePath=${worktreePath} durationMs=${durationMs}`);
        resolve({ success: true, durationMs, output, exitCode: 0, timedOut: false });
      }
    });

    child.on('error', (err) => {
      cleanup();
      const durationMs = Date.now() - start;
      logger.error(`${logPrefix}.error worktreePath=${worktreePath} error=${err.message}`);
      resolve({
        success: false,
        durationMs,
        output: err.message,
        exitCode: null,
        timedOut: false,
      });
    });
  });
}

// ─── Public API ─────────────────────────────────────────────────────

export function runBootstrap(opts: {
  scriptPath: string;
  worktreePath: string;
  repoPath: string;
  metadata: TaskMetadata;
  timeoutMs?: number;
  onOutput?: (line: string) => void;
  onSpawned?: (pid: number) => void;
}): Promise<ScriptResult> {
  return runScript({
    scriptPath: opts.scriptPath,
    worktreePath: opts.worktreePath,
    repoPath: opts.repoPath,
    env: {
      ORCA_TASK_ID: opts.metadata.displayId,
      ORCA_TASK_TITLE: opts.metadata.title,
      ORCA_PROJECT_NAME: opts.metadata.projectName ?? '',
      ORCA_WORKSPACE_SLUG: opts.metadata.workspaceSlug,
    },
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    logPrefix: 'bootstrap',
    onOutput: opts.onOutput,
    onSpawned: opts.onSpawned,
  });
}

export function runPreTerminal(opts: {
  scriptPath: string;
  worktreePath: string;
  repoPath: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}): Promise<ScriptResult> {
  return runScript({
    scriptPath: opts.scriptPath,
    worktreePath: opts.worktreePath,
    repoPath: opts.repoPath,
    env: opts.env,
    timeoutMs: opts.timeoutMs ?? PRE_TERMINAL_TIMEOUT_MS,
    logPrefix: 'pre-terminal',
  });
}

export function runTeardown(opts: {
  scriptPath: string;
  worktreePath: string;
  repoPath: string;
  timeoutMs?: number;
}): Promise<ScriptResult> {
  return runScript({
    scriptPath: opts.scriptPath,
    worktreePath: opts.worktreePath,
    repoPath: opts.repoPath,
    timeoutMs: opts.timeoutMs ?? TEARDOWN_TIMEOUT_MS,
    logPrefix: 'teardown',
  });
}
