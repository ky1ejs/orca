/**
 * Status manager for the daemon process.
 * Uses in-memory token (set by client via auth.setToken) instead of safeStorage.
 */
import { existsSync } from 'node:fs';
import type { DaemonPtyManager, BroadcastFn } from './pty-manager.js';
import { getDefaultShell, getLoginShellArgs } from '../shared/shell.js';
import { findClaudePath, buildOrcaSystemPrompt } from '../shared/claude.js';
import { createPerfTimer } from '../shared/perf.js';
import { createSession, getSession, updateSession } from './sessions.js';
import { SessionStatus, isActiveSessionStatus } from '../shared/session-status.js';
import {
  ClaudeNotFoundError,
  InvalidWorkingDirectoryError,
  PreTerminalError,
  PtySpawnError,
  serializeError,
  type SerializedAgentError,
} from '../shared/errors.js';
import { WorktreeManager, isGitRepo } from './worktree-manager.js';
import {
  findBootstrapScript,
  findPreTerminalScript,
  runPreTerminal,
  isBootstrapped,
  markBootstrapped,
  isBootstrapLocked,
} from './bootstrap-runner.js';
import { BootstrapTracker } from './bootstrap-tracker.js';
import { InputDetector } from '../shared/input-detection.js';
import type { HookServer, HookEvent } from '../shared/hooks/server.js';
import { logger } from './logger.js';
import {
  DAEMON_EVENTS,
  DAEMON_MCP_CONFIG_FILE,
  DAEMON_CLAUDE_SETTINGS_FILE,
  DAEMON_CLI_DIR,
} from '../shared/daemon-protocol.js';
import type { TaskMetadata, BootstrapStatusResult } from '../shared/daemon-protocol.js';

/**
 * Minimum additional *visible* characters before we consider Claude to have resumed after a
 * permission grant or Stop hook. ANSI escape sequences are stripped before measuring, so this
 * threshold is not triggered by cursor positioning, color codes, or status-bar updates that
 * Claude Code's TUI emits while idle. Set to 150 to absorb spinner / timer visible chars.
 */
const PERMISSION_RESUME_THRESHOLD = 150;

/**
 * Grace period (ms) after AwaitingPermission is set, during which we keep advancing the output
 * baseline. The permission dialog text itself can exceed 50 bytes, so we absorb it before locking
 * the baseline for resume detection.
 */
const PERMISSION_GRACE_MS = 2500;

/** How recently (ms) a PTY must have produced output to be considered "active". */
const ACTIVITY_TIMEOUT_MS = 1500;

interface MonitorState {
  interval: ReturnType<typeof setInterval>;
  inputDetector: InputDetector;
  lastStatus: string;
  lastActive: boolean;
  stopDebounce: ReturnType<typeof setTimeout> | null;
  hookListener: ((event: HookEvent) => void) | null;
  workingDirectory: string;
  /** Output length when AwaitingPermission was set; used to detect permission granted */
  permissionOutputLen: number | null;
  /** Timestamp when AwaitingPermission was set; used for grace period */
  permissionSetAt: number | null;
  /** True when WaitingForInput was set by a Stop hook — prevents InputDetector from overriding */
  hookSetWaiting: boolean;
  /** Output length when hookSetWaiting was set; used for output-based resume detection */
  hookWaitingOutputLen: number | null;
  /** Timestamp when hookSetWaiting was set; used for grace period */
  hookWaitingSetAt: number | null;
}

interface DaemonStatusManagerOptions {
  backendUrl: string;
  getToken: () => string | null;
  hookServer: HookServer | null;
  hookPort: number | null;
  broadcast: BroadcastFn;
  worktreeManager: WorktreeManager;
  onSessionExited?: (taskId: string) => void;
}

interface AgentLaunchOptions {
  planMode?: boolean;
}

export class DaemonStatusManager {
  private manager: DaemonPtyManager;
  private monitors = new Map<string, MonitorState>();
  private backendUrl: string;
  private getToken: () => string | null;
  private hookServer: HookServer | null;
  private hookPort: number | null;
  private broadcast: BroadcastFn;
  private worktreeManager: WorktreeManager;
  private onSessionExited: ((taskId: string) => void) | undefined;
  private readonly bootstrapTracker: BootstrapTracker;

  constructor(manager: DaemonPtyManager, options: DaemonStatusManagerOptions) {
    this.manager = manager;
    this.backendUrl = options.backendUrl;
    this.getToken = options.getToken;
    this.hookServer = options.hookServer;
    this.hookPort = options.hookPort;
    this.broadcast = options.broadcast;
    this.worktreeManager = options.worktreeManager;
    this.onSessionExited = options.onSessionExited;
    this.bootstrapTracker = new BootstrapTracker();
  }

  async launch(
    taskId: string,
    workingDirectory: string,
    options?: AgentLaunchOptions,
    metadata?: TaskMetadata,
    colorScheme?: 'light' | 'dark',
    onSessionCreated?: (sessionId: string) => void,
  ): Promise<
    | { success: true; sessionId: string; worktreePath?: string }
    | { success: false; error: SerializedAgentError }
  > {
    try {
      const mark = createPerfTimer('agent.launch', (msg) => logger.info(msg));

      if (!existsSync(workingDirectory)) {
        throw new InvalidWorkingDirectoryError(workingDirectory);
      }
      mark('dir-validated');

      // Create or reuse a worktree for task isolation
      let effectiveWorkingDirectory = workingDirectory;
      let worktreeCreated = false;
      let resolvedRepoPath = workingDirectory;
      if (metadata && (await isGitRepo(workingDirectory))) {
        const worktree = await this.worktreeManager.ensureWorktree(
          taskId,
          workingDirectory,
          metadata,
        );
        effectiveWorkingDirectory = worktree.path;
        worktreeCreated = worktree.created;
        resolvedRepoPath = worktree.repoPath;
        mark('worktree-ensured');
      }

      const session = createSession({
        taskId,
        status: SessionStatus.Starting,
        workingDirectory: effectiveWorkingDirectory,
      });
      mark('session-created');

      // Subscribe the caller early so they receive status events during bootstrap
      onSessionCreated?.(session.id);

      // Discover hook scripts in parallel
      const needsBootstrap = worktreeCreated || !isBootstrapped(effectiveWorkingDirectory);
      const [bootstrapScriptPath, preTerminalScript] = await Promise.all([
        needsBootstrap ? findBootstrapScript(effectiveWorkingDirectory) : Promise.resolve(null),
        findPreTerminalScript(effectiveWorkingDirectory),
      ]);

      // Mark as bootstrapped early if there's no script, so we don't check again
      if (needsBootstrap && !bootstrapScriptPath) {
        markBootstrapped(effectiveWorkingDirectory);
      }

      const env: Record<string, string> = { ORCA_SESSION_ID: session.id };
      if (effectiveWorkingDirectory !== workingDirectory) {
        env.ORCA_WORKTREE_PATH = effectiveWorkingDirectory;
        env.ORCA_REPO_ROOT = resolvedRepoPath;
      }
      // Set COLORFGBG so CLI tools (e.g. Claude Code) can detect light/dark background
      if (colorScheme === 'light') {
        env.COLORFGBG = '0;15'; // dark fg on light bg
      } else {
        env.COLORFGBG = '15;0'; // light fg on dark bg
      }
      if (metadata) {
        env.ORCA_TASK_ID = metadata.displayId;
        env.ORCA_TASK_UUID = taskId;
        env.ORCA_TASK_TITLE = metadata.title;
        env.ORCA_PROJECT_NAME = metadata.projectName ?? '';
        env.ORCA_WORKSPACE_SLUG = metadata.workspaceSlug;
        env.ORCA_TASK_DESCRIPTION = (metadata.description ?? '').slice(0, 1000);
        env.ORCA_SERVER_URL = this.backendUrl;
      }
      logger.debug(`Session ${session.id}: injecting env [${Object.keys(env).join(', ')}]`);

      // Run pre-terminal synchronously — blocks PTY spawn so the agent has correct config
      if (preTerminalScript) {
        mark('pre-terminal-started');
        const preResult = await runPreTerminal({
          scriptPath: preTerminalScript,
          worktreePath: effectiveWorkingDirectory,
          repoPath: resolvedRepoPath,
          env,
        });
        if (!preResult.success) {
          this.updateStatusAndNotify(session.id, SessionStatus.Error);
          throw new PreTerminalError(preResult.exitCode, preResult.output, preResult.timedOut);
        }
        mark('pre-terminal-finished');
      }

      try {
        if (options?.planMode) {
          const claudePath = findClaudePath();
          if (!claudePath) {
            throw new ClaudeNotFoundError();
          }
          mark('command-resolved');
          const args = ['--permission-mode', 'plan'];
          if (this.hookPort) {
            args.push('--mcp-config', DAEMON_MCP_CONFIG_FILE);
            args.push('--settings', DAEMON_CLAUDE_SETTINGS_FILE);
          }
          if (metadata) {
            args.push(
              '--append-system-prompt',
              buildOrcaSystemPrompt(metadata.displayId, metadata.title),
            );
          }
          this.manager.spawn(session.id, claudePath, args, effectiveWorkingDirectory, env);
        } else {
          // Prepend ~/.orca/bin to PATH so the `orca` CLI wrapper is available in the shell
          if (this.hookPort) {
            env.PATH = `${DAEMON_CLI_DIR}:${process.env.PATH ?? ''}`;
          }
          const shell = getDefaultShell();
          mark('shell-resolved');
          this.manager.spawn(
            session.id,
            shell,
            getLoginShellArgs(),
            effectiveWorkingDirectory,
            env,
          );
        }
      } catch (err) {
        if (err instanceof ClaudeNotFoundError) throw err;
        throw new PtySpawnError(err);
      }
      mark('pty-spawned');

      // Fire-and-forget bootstrap — heavy setup runs in background after PTY spawn
      if (needsBootstrap && bootstrapScriptPath && metadata) {
        if (
          !this.bootstrapTracker.isRunning(effectiveWorkingDirectory) &&
          !isBootstrapLocked(effectiveWorkingDirectory)
        ) {
          this.bootstrapTracker.start({
            scriptPath: bootstrapScriptPath,
            worktreePath: effectiveWorkingDirectory,
            repoPath: resolvedRepoPath,
            metadata,
            broadcast: this.broadcast,
          });
          mark('bootstrap-started-background');
        }
      }

      // Fire-and-forget: avoid blocking the launch response on a non-critical mutation
      const userId = this.getUserIdFromToken();
      void this.updateTask(taskId, {
        status: 'IN_PROGRESS',
        ...(userId && { assigneeId: userId }),
      });
      mark('task-update-dispatched');

      this.startMonitoring(session.id, taskId, effectiveWorkingDirectory);
      mark('monitoring-started');

      const worktreePath =
        effectiveWorkingDirectory !== workingDirectory ? effectiveWorkingDirectory : undefined;
      return { success: true, sessionId: session.id, worktreePath };
    } catch (err) {
      return { success: false, error: serializeError(err) };
    }
  }

  stop(sessionId: string): void {
    this.stopMonitoring(sessionId);
    this.manager.kill(sessionId);
  }

  async restart(
    taskId: string,
    sessionId: string,
    workingDirectory: string,
    options?: AgentLaunchOptions,
    metadata?: TaskMetadata,
    colorScheme?: 'light' | 'dark',
    onSessionCreated?: (sessionId: string) => void,
  ): Promise<
    | { success: true; sessionId: string; worktreePath?: string }
    | { success: false; error: SerializedAgentError }
  > {
    this.stop(sessionId);
    return this.launch(taskId, workingDirectory, options, metadata, colorScheme, onSessionCreated);
  }

  getStatus(sessionId: string): string | null {
    const session = getSession(sessionId);
    return session?.status ?? null;
  }

  /** Returns bootstrap status for the given worktree (used by the BOOTSTRAP_STATUS handler). */
  getBootstrapStatus(worktreePath: string): BootstrapStatusResult {
    if (this.bootstrapTracker.isRunning(worktreePath)) {
      return { status: 'running', lines: [...this.bootstrapTracker.getOutput(worktreePath)] };
    }
    if (isBootstrapped(worktreePath)) return { status: 'completed', lines: [] };
    if (isBootstrapLocked(worktreePath)) return { status: 'running', lines: [] };
    return { status: 'pending', lines: [] };
  }

  /** Number of in-flight bootstraps (used by idle manager). */
  bootstrapActiveCount(): number {
    return this.bootstrapTracker.activeCount();
  }

  dispose(): void {
    for (const sessionId of this.monitors.keys()) {
      this.stopMonitoring(sessionId);
    }
    this.bootstrapTracker.dispose();
  }

  private startMonitoring(sessionId: string, taskId: string, workingDirectory: string): void {
    const inputDetector = new InputDetector();

    inputDetector.setOnChange((waiting) => {
      const monitor = this.monitors.get(sessionId);
      if (waiting) {
        // Don't downgrade AwaitingPermission or override hook-set WaitingForInput
        const session = getSession(sessionId);
        if (session?.status !== SessionStatus.AwaitingPermission && !monitor?.hookSetWaiting) {
          this.updateStatusAndNotify(sessionId, SessionStatus.WaitingForInput);
        }
      } else {
        // Only clear WaitingForInput if the input detector set it (not a hook)
        const session = getSession(sessionId);
        if (
          session &&
          session.status === SessionStatus.WaitingForInput &&
          !monitor?.hookSetWaiting
        ) {
          this.updateStatusAndNotify(sessionId, SessionStatus.Running);
        }
      }
    });

    let lastStatus: string = SessionStatus.Starting;

    const hookListener = (event: HookEvent) => {
      if (event.sessionId !== sessionId) return;

      const monitor = this.monitors.get(sessionId);
      if (!monitor) return;

      const session = getSession(sessionId);
      if (!session || !isActiveSessionStatus(session.status)) return;

      const cancelDebounce = () => {
        if (monitor.stopDebounce) {
          clearTimeout(monitor.stopDebounce);
          monitor.stopDebounce = null;
        }
      };

      switch (event.eventName) {
        case 'Stop': {
          // Debounce Stop events — a PermissionRequest or UserPromptSubmit may follow
          cancelDebounce();
          monitor.stopDebounce = setTimeout(() => {
            monitor.stopDebounce = null;
            // Don't downgrade AwaitingPermission
            const current = getSession(sessionId);
            if (current?.status === SessionStatus.AwaitingPermission) return;
            monitor.hookSetWaiting = true;
            monitor.hookWaitingOutputLen = this.manager.visibleOutputSize(sessionId);
            monitor.hookWaitingSetAt = Date.now();
            this.updateStatusAndNotify(sessionId, SessionStatus.WaitingForInput);
          }, 200);
          break;
        }
        case 'PermissionRequest': {
          cancelDebounce();
          monitor.hookSetWaiting = false;
          monitor.hookWaitingOutputLen = null;
          monitor.hookWaitingSetAt = null;
          monitor.permissionOutputLen = this.manager.visibleOutputSize(sessionId);
          monitor.permissionSetAt = Date.now();
          this.updateStatusAndNotify(sessionId, SessionStatus.AwaitingPermission);
          break;
        }
        case 'UserPromptSubmit': {
          cancelDebounce();
          monitor.hookSetWaiting = false;
          monitor.hookWaitingOutputLen = null;
          monitor.hookWaitingSetAt = null;
          monitor.permissionOutputLen = null;
          monitor.permissionSetAt = null;
          this.updateStatusAndNotify(sessionId, SessionStatus.Running);
          break;
        }
      }
    };

    if (this.hookServer) {
      this.hookServer.on('hook', hookListener);
    }

    const interval = setInterval(async () => {
      const session = getSession(sessionId);
      if (!session) {
        this.stopMonitoring(sessionId);
        return;
      }

      if (session.status !== lastStatus) {
        if (session.status === SessionStatus.Exited && lastStatus !== SessionStatus.Exited) {
          await this.updateTask(taskId, { status: 'IN_REVIEW' });
          this.onSessionExited?.(taskId);
          this.stopMonitoring(sessionId);
        }
        lastStatus = session.status;
      }

      const monitor = this.monitors.get(sessionId);

      // Feed InputDetector when it can act — skip when hooks have set the status
      if (
        monitor &&
        session.status !== SessionStatus.AwaitingPermission &&
        !monitor.hookSetWaiting
      ) {
        const tail = this.manager.tail(sessionId, 500);
        if (tail) {
          inputDetector.onOutput(tail);
        }
      }

      // Claude doesn't fire a hook when permission is granted, so detect it
      // by watching for new output (Claude resumed work after permission)
      if (
        monitor &&
        session.status === SessionStatus.AwaitingPermission &&
        monitor.permissionOutputLen !== null &&
        monitor.permissionSetAt !== null
      ) {
        const elapsed = Date.now() - monitor.permissionSetAt;
        const currentSize = this.manager.visibleOutputSize(sessionId);
        if (elapsed < PERMISSION_GRACE_MS) {
          // Still in grace period — absorb dialog output by advancing the baseline
          monitor.permissionOutputLen = currentSize;
        } else if (currentSize > monitor.permissionOutputLen + PERMISSION_RESUME_THRESHOLD) {
          // Grace period over and new output appeared — permission was granted
          monitor.hookSetWaiting = false;
          monitor.hookWaitingOutputLen = null;
          monitor.hookWaitingSetAt = null;
          monitor.permissionOutputLen = null;
          monitor.permissionSetAt = null;
          this.updateStatusAndNotify(sessionId, SessionStatus.Running);
        }
      }

      // Safety net: detect Claude resuming after a Stop hook without a UserPromptSubmit.
      // Uses the same grace-period + output-threshold pattern as permission detection.
      if (
        monitor &&
        monitor.hookSetWaiting &&
        monitor.hookWaitingOutputLen !== null &&
        monitor.hookWaitingSetAt !== null
      ) {
        const elapsed = Date.now() - monitor.hookWaitingSetAt;
        const currentSize = this.manager.visibleOutputSize(sessionId);
        if (elapsed < PERMISSION_GRACE_MS) {
          // Still in grace period — absorb idle prompt output by advancing the baseline
          monitor.hookWaitingOutputLen = currentSize;
        } else if (currentSize > monitor.hookWaitingOutputLen + PERMISSION_RESUME_THRESHOLD) {
          // Grace period over and new output appeared — Claude resumed
          monitor.hookSetWaiting = false;
          monitor.hookWaitingOutputLen = null;
          monitor.hookWaitingSetAt = null;
          this.updateStatusAndNotify(sessionId, SessionStatus.Running);
        }
      }

      // Check PTY output activity
      if (monitor) {
        const lastData = this.manager.getLastDataAt(sessionId);
        const active = lastData !== undefined && Date.now() - lastData < ACTIVITY_TIMEOUT_MS;
        if (active !== monitor.lastActive) {
          monitor.lastActive = active;
          this.broadcast(DAEMON_EVENTS.SESSION_ACTIVITY_CHANGED, { sessionId, active });
        }
      }
    }, 500);

    this.monitors.set(sessionId, {
      interval,
      inputDetector,
      lastStatus,
      lastActive: false,
      stopDebounce: null,
      hookListener,
      workingDirectory,
      permissionOutputLen: null,
      permissionSetAt: null,
      hookSetWaiting: false,
      hookWaitingOutputLen: null,
      hookWaitingSetAt: null,
    });
  }

  private stopMonitoring(sessionId: string): void {
    const monitor = this.monitors.get(sessionId);
    if (monitor) {
      clearInterval(monitor.interval);
      if (monitor.stopDebounce) {
        clearTimeout(monitor.stopDebounce);
      }
      if (monitor.hookListener && this.hookServer) {
        this.hookServer.removeListener('hook', monitor.hookListener);
      }
      monitor.inputDetector.dispose();
      this.monitors.delete(sessionId);
    }
  }

  private updateStatusAndNotify(sessionId: string, status: SessionStatus): void {
    const session = getSession(sessionId);
    if (!session || !isActiveSessionStatus(session.status)) return;
    updateSession(sessionId, { status });
    this.broadcast(DAEMON_EVENTS.SESSION_STATUS_CHANGED, { sessionId, status });
  }

  private getUserIdFromToken(): string | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return (payload.sub as string) ?? null;
    } catch {
      return null;
    }
  }

  private async updateTask(
    taskId: string,
    input: { status?: string; assigneeId?: string },
  ): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    const mutation = `
      mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
        updateTask(id: $id, input: $input) {
          id
          status
        }
      }
    `;

    try {
      await fetch(`${this.backendUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: mutation,
          variables: { id: taskId, input },
        }),
      });
    } catch {
      // Backend may not be reachable
    }
  }
}
