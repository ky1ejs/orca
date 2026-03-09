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
import { ensureHooks, removeHooks } from '../shared/hooks/settings.js';
import { DAEMON_EVENTS } from '../shared/daemon-protocol.js';

interface MonitorState {
  interval: ReturnType<typeof setInterval>;
  inputDetector: InputDetector;
  lastStatus: string;
  hooksActive: boolean;
  stopDebounce: ReturnType<typeof setTimeout> | null;
  hookListener: ((event: HookEvent) => void) | null;
  workingDirectory: string;
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

      // Ensure Claude Code hooks are configured before spawning
      const hookPort = this.hookServer?.getPort();
      if (hookPort) {
        try {
          ensureHooks(workingDirectory, hookPort);
        } catch (err) {
          console.warn('[orca] Failed to ensure hooks:', err);
        }
      }

      const env = { ORCA_SESSION_ID: session.id };

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
        removeHooks(workingDirectory);
      } catch (err) {
        console.warn('[orca] Failed to remove hooks on stop:', err);
      }
    }
  }

  async restart(
    taskId: string,
    sessionId: string,
    workingDirectory: string,
    options?: AgentLaunchOptions,
  ): Promise<
    { success: true; sessionId: string } | { success: false; error: SerializedAgentError }
  > {
    this.stop(sessionId);
    return this.launch(taskId, workingDirectory, options);
  }

  getStatus(sessionId: string): string | null {
    const session = getSession(sessionId);
    return session?.status ?? null;
  }

  dispose(): void {
    for (const [sessionId, monitor] of this.monitors) {
      try {
        removeHooks(monitor.workingDirectory);
      } catch (err) {
        console.warn('[orca] Failed to remove hooks on dispose:', err);
      }
      this.stopMonitoring(sessionId);
    }
  }

  private startMonitoring(sessionId: string, taskId: string, workingDirectory: string): void {
    const inputDetector = new InputDetector();

    inputDetector.setOnChange((waiting) => {
      if (waiting) {
        this.updateStatusAndNotify(sessionId, SessionStatus.WaitingForInput);
      } else {
        const session = getSession(sessionId);
        if (session && session.status === SessionStatus.WaitingForInput) {
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

      // First hook event disables InputDetector feeding
      if (!monitor.hooksActive) {
        monitor.hooksActive = true;
      }

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
            this.updateStatusAndNotify(sessionId, SessionStatus.WaitingForInput);
          }, 200);
          break;
        }
        case 'PermissionRequest': {
          cancelDebounce();
          this.updateStatusAndNotify(sessionId, SessionStatus.AwaitingPermission);
          break;
        }
        case 'UserPromptSubmit': {
          cancelDebounce();
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

      // Only feed InputDetector if hooks haven't taken over
      const monitor = this.monitors.get(sessionId);
      if (monitor && !monitor.hooksActive) {
        try {
          const output = this.manager.replay(sessionId);
          if (output) {
            // Only check the tail of the output for prompt detection
            const tail = output.slice(-500);
            inputDetector.onOutput(tail);
          }
        } catch {
          // Session may no longer exist
        }
      }
    }, 500);

    this.monitors.set(sessionId, {
      interval,
      inputDetector,
      lastStatus,
      hooksActive: false,
      stopDebounce: null,
      hookListener,
      workingDirectory,
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
