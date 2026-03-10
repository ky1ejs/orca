/**
 * Status manager for the daemon process.
 * Uses in-memory token (set by client via auth.setToken) instead of safeStorage.
 */
import { existsSync } from 'node:fs';
import type { DaemonPtyManager, BroadcastFn } from './pty-manager.js';
import { getDefaultShell, getLoginShellArgs } from '../shared/shell.js';
import { findClaudePath } from '../shared/claude.js';
import { createSession, getSession, updateSession } from './sessions.js';
import { SessionStatus, isActiveSessionStatus } from '../shared/session-status.js';
import {
  ClaudeNotFoundError,
  InvalidWorkingDirectoryError,
  PtySpawnError,
  serializeError,
  type SerializedAgentError,
} from '../shared/errors.js';
import { InputDetector } from '../shared/input-detection.js';
import type { HookServer, HookEvent } from '../shared/hooks/server.js';
import { ensureOrcaSettings, removeOrcaSettings } from '../shared/hooks/settings.js';
import { logger } from './logger.js';
import { DAEMON_EVENTS } from '../shared/daemon-protocol.js';
import type { TaskMetadata } from '../shared/daemon-protocol.js';

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
  broadcast: BroadcastFn;
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
  private broadcast: BroadcastFn;

  constructor(manager: DaemonPtyManager, options: DaemonStatusManagerOptions) {
    this.manager = manager;
    this.backendUrl = options.backendUrl;
    this.getToken = options.getToken;
    this.hookServer = options.hookServer;
    this.broadcast = options.broadcast;
  }

  async launch(
    taskId: string,
    workingDirectory: string,
    options?: AgentLaunchOptions,
    metadata?: TaskMetadata,
  ): Promise<
    { success: true; sessionId: string } | { success: false; error: SerializedAgentError }
  > {
    try {
      if (!existsSync(workingDirectory)) {
        throw new InvalidWorkingDirectoryError(workingDirectory);
      }

      const session = createSession({
        taskId,
        status: SessionStatus.Starting,
        workingDirectory,
      });

      // Ensure Claude Code hooks and MCP config are configured before spawning
      const hookPort = this.hookServer?.getPort();
      if (hookPort) {
        try {
          ensureOrcaSettings(workingDirectory, hookPort);
        } catch (err) {
          logger.warn(`Failed to ensure Orca settings: ${err}`);
        }
      }

      const env: Record<string, string> = { ORCA_SESSION_ID: session.id };
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

      try {
        if (options?.planMode) {
          const claudePath = findClaudePath();
          if (!claudePath) {
            throw new ClaudeNotFoundError();
          }
          this.manager.spawn(
            session.id,
            claudePath,
            ['--permission-mode', 'plan'],
            workingDirectory,
            env,
          );
        } else {
          const shell = getDefaultShell();
          this.manager.spawn(session.id, shell, getLoginShellArgs(), workingDirectory, env);
        }
      } catch (err) {
        if (err instanceof ClaudeNotFoundError) throw err;
        throw new PtySpawnError(err);
      }

      // Update task to IN_PROGRESS
      await this.updateTaskStatus(taskId, 'IN_PROGRESS');

      this.startMonitoring(session.id, taskId, workingDirectory);

      return { success: true, sessionId: session.id };
    } catch (err) {
      return { success: false, error: serializeError(err) };
    }
  }

  stop(sessionId: string): void {
    const monitor = this.monitors.get(sessionId);
    const workingDirectory = monitor?.workingDirectory;

    this.stopMonitoring(sessionId);
    this.manager.kill(sessionId);

    if (workingDirectory) {
      try {
        removeOrcaSettings(workingDirectory);
      } catch (err) {
        logger.warn(`Failed to clean up on stop: ${err}`);
      }
    }
  }

  async restart(
    taskId: string,
    sessionId: string,
    workingDirectory: string,
    options?: AgentLaunchOptions,
    metadata?: TaskMetadata,
  ): Promise<
    { success: true; sessionId: string } | { success: false; error: SerializedAgentError }
  > {
    this.stop(sessionId);
    return this.launch(taskId, workingDirectory, options, metadata);
  }

  getStatus(sessionId: string): string | null {
    const session = getSession(sessionId);
    return session?.status ?? null;
  }

  dispose(): void {
    for (const [sessionId, monitor] of this.monitors) {
      try {
        removeOrcaSettings(monitor.workingDirectory);
      } catch (err) {
        logger.warn(`Failed to clean up on dispose: ${err}`);
      }
      this.stopMonitoring(sessionId);
    }
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
          await this.updateTaskStatus(taskId, 'IN_REVIEW');
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
        try {
          const output = this.manager.replay(sessionId);
          if (output) {
            const tail = output.slice(-500);
            inputDetector.onOutput(tail);
          }
        } catch {
          // Session may no longer exist
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

  private async updateTaskStatus(taskId: string, status: string): Promise<void> {
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
          variables: { id: taskId, input: { status } },
        }),
      });
    } catch {
      // Backend may not be reachable
    }
  }
}
