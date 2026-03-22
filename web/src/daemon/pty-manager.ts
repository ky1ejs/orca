/**
 * PTY manager for the daemon process.
 * Broadcasts data via a callback instead of Electron's BrowserWindow.
 */
import * as pty from 'node-pty';
import { updateSession } from './sessions.js';
import { SessionStatus } from '../shared/session-status.js';
import { RingBuffer } from '../shared/ring-buffer.js';
import { processKittyKeyboard } from './kitty-keyboard.js';

interface PtyProcess {
  pty: pty.IPty;
  sessionId: string;
}

export type BroadcastFn = (event: string, params: unknown) => void;

export class DaemonPtyManager {
  private processes = new Map<string, PtyProcess>();
  private buffers = new Map<string, RingBuffer>();
  private snapshots = new Map<string, string>();
  private lastDataAt = new Map<string, number>();
  private disposed = false;
  private broadcast: BroadcastFn;
  private onDataCallback: ((sessionId: string) => void) | null = null;
  private onExitCallback: ((sessionId: string) => void) | null = null;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
  }

  setOnData(cb: (sessionId: string) => void): void {
    this.onDataCallback = cb;
  }

  setOnExit(cb: (sessionId: string) => void): void {
    this.onExitCallback = cb;
  }

  restoreBuffer(sessionId: string, content: string): void {
    const buf = new RingBuffer();
    buf.append(content);
    this.buffers.set(sessionId, buf);
  }

  spawn(
    sessionId: string,
    command: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>,
  ): void {
    const { ELECTRON_RUN_AS_NODE: _, ...cleanEnv } = process.env;
    const shell = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: { ...cleanEnv, ...env },
    });

    this.processes.set(sessionId, { pty: shell, sessionId });
    this.buffers.set(sessionId, new RingBuffer());

    updateSession(sessionId, { pid: shell.pid, status: SessionStatus.Running });

    shell.onData((data: string) => {
      if (this.disposed) return;
      this.lastDataAt.set(sessionId, Date.now());
      const { output, response } = processKittyKeyboard(data);
      if (response) shell.write(response);
      this.buffers.get(sessionId)?.append(output);
      this.onDataCallback?.(sessionId);
      this.broadcast('pty.data', { sessionId, data: output });
    });

    shell.onExit(({ exitCode }: { exitCode: number }) => {
      this.processes.delete(sessionId);
      this.lastDataAt.delete(sessionId);
      if (this.disposed) return;
      this.onExitCallback?.(sessionId);
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
      this.onExitCallback?.(sessionId);
      proc.pty.kill();
      this.processes.delete(sessionId);
      this.buffers.delete(sessionId);
      this.snapshots.delete(sessionId);
      this.lastDataAt.delete(sessionId);
    }
  }

  setSnapshot(sessionId: string, content: string): void {
    this.snapshots.set(sessionId, content);
    this.onDataCallback?.(sessionId);
  }

  getSnapshot(sessionId: string): string | undefined {
    return this.snapshots.get(sessionId);
  }

  replay(sessionId: string): string {
    return this.buffers.get(sessionId)?.replay() ?? '';
  }

  tail(sessionId: string, n: number): string {
    return this.buffers.get(sessionId)?.tail(n) ?? '';
  }

  visibleOutputSize(sessionId: string): number {
    return this.buffers.get(sessionId)?.visibleSize ?? 0;
  }

  clear(sessionId: string): void {
    this.buffers.get(sessionId)?.clear();
    this.onDataCallback?.(sessionId);
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
    this.buffers.clear();
    this.snapshots.clear();
    this.lastDataAt.clear();
  }

  getLastDataAt(sessionId: string): number | undefined {
    return this.lastDataAt.get(sessionId);
  }

  getManagedPids(): Map<string, number> {
    const pids = new Map<string, number>();
    for (const [sessionId, proc] of this.processes) {
      pids.set(sessionId, proc.pty.pid);
    }
    return pids;
  }
}
