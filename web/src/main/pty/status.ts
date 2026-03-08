import { existsSync } from 'node:fs';
import { BrowserWindow } from 'electron';
import type { PtyManager } from './manager.js';
import { getDefaultShell, getLoginShellArgs } from './shell.js';
import { findClaudePath } from './claude.js';
import { createSession, getSession, updateSession } from '../db/sessions.js';
import { SessionStatus } from '../../shared/session-status.js';
import {
  ClaudeNotFoundError,
  InvalidWorkingDirectoryError,
  PtySpawnError,
  serializeError,
  type SerializedAgentError,
} from './errors.js';
import { InputDetector } from './input-detection.js';
import { readToken } from './auth.js';
import type { HookServer, HookEvent } from '../hooks/server.js';
import { ensureHooks, removeHooks } from '../hooks/settings.js';

interface MonitorState {
  interval: ReturnType<typeof setInterval>;
  inputDetector: InputDetector;
  lastStatus: string;
  hooksActive: boolean;
  stopDebounce: ReturnType<typeof setTimeout> | null;
  hookListener: ((event: HookEvent) => void) | null;
  workingDirectory: string;
}

interface StatusManagerOptions {
  backendUrl: string;
  hookServerPort?: number | null;
}

export interface AgentLaunchOptions {
  planMode?: boolean;
}

export class StatusManager {
  private manager: PtyManager;
  private hookServer: HookServer | null;
  private hookServerPort: number | null;
  private monitors = new Map<string, MonitorState>();
  private backendUrl: string;

  constructor(manager: PtyManager, hookServer: HookServer | null, options: StatusManagerOptions) {
    this.manager = manager;
    this.hookServer = hookServer;
    this.backendUrl = options.backendUrl;
    this.hookServerPort = options.hookServerPort ?? null;
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
      if (this.hookServerPort) {
        try {
          ensureHooks(workingDirectory, this.hookServerPort);
        } catch (err) {
          console.warn('[orca] Failed to ensure hooks:', err);
        }
      }

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
            { ORCA_SESSION_ID: session.id },
          );
        } else {
          const shell = getDefaultShell();
          this.manager.spawn(session.id, shell, getLoginShellArgs(), workingDirectory, {
            ORCA_SESSION_ID: session.id,
          });
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

    // Hook event listener
    let hooksActive = false;
    let stopDebounce: ReturnType<typeof setTimeout> | null = null;

    const hookListener = (event: HookEvent) => {
      if (event.sessionId !== sessionId) return;

      const session = getSession(sessionId);
      if (!session) return;
      if (session.status === SessionStatus.Exited || session.status === SessionStatus.Error) {
        return;
      }

      // First hook event disables InputDetector feeding
      if (!hooksActive) {
        hooksActive = true;
        const monitor = this.monitors.get(sessionId);
        if (monitor) {
          monitor.hooksActive = true;
        }
      }

      switch (event.eventName) {
        case 'Stop': {
          // Debounce Stop events — a PermissionRequest or UserPromptSubmit may follow
          if (stopDebounce) clearTimeout(stopDebounce);
          stopDebounce = setTimeout(() => {
            stopDebounce = null;
            this.updateStatusAndNotify(sessionId, SessionStatus.WaitingForInput);
          }, 200);
          const monitor = this.monitors.get(sessionId);
          if (monitor) monitor.stopDebounce = stopDebounce;
          break;
        }
        case 'PermissionRequest': {
          if (stopDebounce) {
            clearTimeout(stopDebounce);
            stopDebounce = null;
          }
          this.updateStatusAndNotify(sessionId, SessionStatus.AwaitingPermission);
          const monitor = this.monitors.get(sessionId);
          if (monitor) monitor.stopDebounce = null;
          break;
        }
        case 'UserPromptSubmit': {
          if (stopDebounce) {
            clearTimeout(stopDebounce);
            stopDebounce = null;
          }
          this.updateStatusAndNotify(sessionId, SessionStatus.Running);
          const monitor = this.monitors.get(sessionId);
          if (monitor) monitor.stopDebounce = null;
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
    if (!session) return;
    // Don't update if session is in terminal state
    if (session.status === SessionStatus.Exited || session.status === SessionStatus.Error) return;
    updateSession(sessionId, { status });
    this.sendToRenderer('session:status-changed', { sessionId, status });
  }

  private sendToRenderer(channel: string, data: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, data);
    }
  }

  private async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const token = readToken();
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
