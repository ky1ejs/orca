/**
 * Status manager for the daemon process.
 * Uses in-memory token (set by client via auth.setToken) instead of safeStorage.
 */
import { existsSync } from 'node:fs';
import type { DaemonPtyManager } from './pty-manager.js';
import { getDefaultShell, getLoginShellArgs } from '../shared/shell.js';
import { findClaudePath } from '../shared/claude.js';
import { createSession, getSession, updateSession } from './sessions.js';
import { SessionStatus } from '../shared/session-status.js';
import {
  ClaudeNotFoundError,
  InvalidWorkingDirectoryError,
  PtySpawnError,
  serializeError,
  type SerializedAgentError,
} from '../shared/errors.js';
import { InputDetector } from '../shared/input-detection.js';

interface MonitorState {
  interval: ReturnType<typeof setInterval>;
  inputDetector: InputDetector;
  lastStatus: string;
}

interface DaemonStatusManagerOptions {
  backendUrl: string;
  getToken: () => string | null;
}

export interface AgentLaunchOptions {
  planMode?: boolean;
}

export class DaemonStatusManager {
  private manager: DaemonPtyManager;
  private monitors = new Map<string, MonitorState>();
  private backendUrl: string;
  private getToken: () => string | null;

  constructor(manager: DaemonPtyManager, options: DaemonStatusManagerOptions) {
    this.manager = manager;
    this.backendUrl = options.backendUrl;
    this.getToken = options.getToken;
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
          );
        } else {
          const shell = getDefaultShell();
          this.manager.spawn(session.id, shell, getLoginShellArgs(), workingDirectory);
        }
      } catch (err) {
        if (err instanceof ClaudeNotFoundError) throw err;
        throw new PtySpawnError(err);
      }

      // Update task to IN_PROGRESS
      await this.updateTaskStatus(taskId, 'IN_PROGRESS');

      this.startMonitoring(session.id, taskId);

      return { success: true, sessionId: session.id };
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
    for (const [sessionId] of this.monitors) {
      this.stopMonitoring(sessionId);
    }
  }

  private startMonitoring(sessionId: string, taskId: string): void {
    const inputDetector = new InputDetector();

    inputDetector.setOnChange((waiting) => {
      if (waiting) {
        updateSession(sessionId, { status: SessionStatus.WaitingForInput });
      } else {
        const session = getSession(sessionId);
        if (session && session.status === SessionStatus.WaitingForInput) {
          updateSession(sessionId, { status: SessionStatus.Running });
        }
      }
    });

    let lastStatus: string = SessionStatus.Starting;

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

      // Feed output to input detector
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
    }, 500);

    this.monitors.set(sessionId, { interval, inputDetector, lastStatus });
  }

  private stopMonitoring(sessionId: string): void {
    const monitor = this.monitors.get(sessionId);
    if (monitor) {
      clearInterval(monitor.interval);
      monitor.inputDetector.dispose();
      this.monitors.delete(sessionId);
    }
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
