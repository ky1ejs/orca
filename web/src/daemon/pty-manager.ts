/**
 * PTY manager for the daemon process.
 * Broadcasts data via a callback instead of Electron's BrowserWindow.
 */
import * as pty from 'node-pty';
import { updateSession } from './sessions.js';
import { SessionStatus } from '../shared/session-status.js';
import { appendOutput, replayOutput, clearOutput } from './output-buffer.js';

interface PtyProcess {
  pty: pty.IPty;
  sessionId: string;
}

export type BroadcastFn = (event: string, params: unknown) => void;

export class DaemonPtyManager {
  private processes = new Map<string, PtyProcess>();
  private disposed = false;
  private broadcast: BroadcastFn;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
  }

  spawn(sessionId: string, command: string, args: string[], cwd: string): void {
    const shell = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
    });

    this.processes.set(sessionId, { pty: shell, sessionId });

    updateSession(sessionId, { pid: shell.pid, status: SessionStatus.Running });

    shell.onData((data: string) => {
      if (this.disposed) return;
      try {
        appendOutput(sessionId, data);
      } catch {
        // DB may be closed during shutdown
      }
      this.broadcast('pty.data', { sessionId, data });
    });

    shell.onExit(({ exitCode }: { exitCode: number }) => {
      this.processes.delete(sessionId);
      if (this.disposed) return;
      try {
        updateSession(sessionId, {
          status: exitCode === 0 ? SessionStatus.Exited : SessionStatus.Error,
          stoppedAt: new Date().toISOString(),
        });
      } catch {
        // DB may be closed during shutdown
      }
      this.broadcast('pty.exit', { sessionId, exitCode });
    });
  }

  write(sessionId: string, data: string): void {
    const proc = this.processes.get(sessionId);
    if (proc) proc.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const proc = this.processes.get(sessionId);
    if (proc) proc.pty.resize(cols, rows);
  }

  kill(sessionId: string): void {
    const proc = this.processes.get(sessionId);
    if (proc) {
      proc.pty.kill();
      this.processes.delete(sessionId);
    }
  }

  replay(sessionId: string): string {
    return replayOutput(sessionId);
  }

  clear(sessionId: string): void {
    clearOutput(sessionId);
  }

  get activeCount(): number {
    return this.processes.size;
  }

  killAll(): void {
    this.disposed = true;
    for (const [, proc] of this.processes) {
      proc.pty.kill('SIGTERM');
    }
    this.processes.clear();
  }

  getManagedPids(): Map<string, number> {
    const pids = new Map<string, number>();
    for (const [sessionId, proc] of this.processes) {
      pids.set(sessionId, proc.pty.pid);
    }
    return pids;
  }
}
