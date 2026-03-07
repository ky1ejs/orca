import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import { updateSession } from '../db/sessions.js';
import { appendOutput, replayOutput, clearOutput } from './output-buffer.js';

interface PtyProcess {
  pty: pty.IPty;
  sessionId: string;
}

export class PtyManager {
  private processes = new Map<string, PtyProcess>();
  private disposed = false;

  spawn(sessionId: string, command: string, args: string[], cwd: string): void {
    const shell = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
    });

    this.processes.set(sessionId, { pty: shell, sessionId });

    updateSession(sessionId, { pid: shell.pid, status: 'RUNNING' });

    shell.onData((data: string) => {
      if (this.disposed) return;
      try {
        appendOutput(sessionId, data);
      } catch {
        // DB may be closed during shutdown
      }
      this.sendToRenderer(`pty:data:${sessionId}`, data);
    });

    shell.onExit(({ exitCode }: { exitCode: number }) => {
      this.processes.delete(sessionId);
      if (this.disposed) return;
      try {
        updateSession(sessionId, {
          status: exitCode === 0 ? 'EXITED' : 'ERROR',
          stoppedAt: new Date().toISOString(),
        });
      } catch {
        // DB may be closed during shutdown
      }
      this.sendToRenderer(`pty:exit:${sessionId}`, exitCode);
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

  killAll(): void {
    this.disposed = true;
    for (const [, proc] of this.processes) {
      proc.pty.kill();
    }
    this.processes.clear();
  }

  private sendToRenderer(channel: string, data: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, data);
    }
  }
}
