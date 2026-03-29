/**
 * PTY manager for the daemon process.
 * Broadcasts data via a callback instead of Electron's BrowserWindow.
 */
import * as pty from 'node-pty';
import { updateSession } from './sessions.js';
import { SessionStatus } from '../shared/session-status.js';
import { RingBuffer } from '../shared/ring-buffer.js';
import { processKittyKeyboard, KITTY_TERM_PROGRAM } from './kitty-keyboard.js';
import { DataBatcher } from './data-batcher.js';

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
  private batcher: DataBatcher;
  private onDataCallback: ((sessionId: string) => void) | null = null;
  private onExitCallback: ((sessionId: string) => void) | null = null;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
    this.batcher = new DataBatcher();

    this.batcher.onFlush((sessionId, data) => {
      this.buffers.get(sessionId)?.append(data);
      this.onDataCallback?.(sessionId);
      this.broadcast('pty.data', { sessionId, data });
    });

    this.batcher.onPause((sessionId) => {
      this.processes.get(sessionId)?.pty.pause();
    });

    this.batcher.onResume((sessionId) => {
      this.processes.get(sessionId)?.pty.resume();
    });
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
      env: {
        ...cleanEnv,
        ...env,
        // Triggers Claude Code to push kitty keyboard mode, enabling Shift+Enter.
        // See kitty-keyboard.ts for the full protocol explanation.
        TERM_PROGRAM: KITTY_TERM_PROGRAM,
        // Signal truecolor support so CLI tools (chalk, bat, vim, etc.) detect
        // color capability. xterm.js supports full 24-bit RGB via SGR sequences.
        COLORTERM: 'truecolor',
      },
    });

    this.processes.set(sessionId, { pty: shell, sessionId });
    this.buffers.set(sessionId, new RingBuffer());

    updateSession(sessionId, { pid: shell.pid, status: SessionStatus.Running });

    shell.onData((data: string) => {
      if (this.disposed) return;
      this.lastDataAt.set(sessionId, Date.now());
      const { output, response } = processKittyKeyboard(data);
      if (response) shell.write(response);
      this.batcher.push(sessionId, output);
    });

    shell.onExit(({ exitCode }: { exitCode: number }) => {
      this.processes.delete(sessionId);
      this.lastDataAt.delete(sessionId);
      if (this.disposed) return;
      // Flush remaining batched data before signaling exit so
      // consumers receive the last output before the exit event.
      this.batcher.flushAndRemove(sessionId);
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

  ack(sessionId: string, bytes: number): void {
    this.batcher.ack(sessionId, bytes);
  }

  /** Reset flow control state after a client reconnect so stale unacked
   *  bytes from the disconnect gap don't permanently pause the PTY. */
  resetFlowControl(sessionId: string): void {
    this.batcher.resetUnacked(sessionId);
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
    }
    // Always clean up state even when the process already exited naturally.
    // shell.onExit removes the process entry but intentionally leaves buffers
    // for replay. When the session is later deleted via the UI, we must clear
    // everything so late-arriving snapshots don't trigger persistence for a
    // deleted DB row.
    this.batcher.remove(sessionId);
    this.processes.delete(sessionId);
    this.buffers.delete(sessionId);
    this.snapshots.delete(sessionId);
    this.lastDataAt.delete(sessionId);
  }

  setSnapshot(sessionId: string, content: string): void {
    // Renderer may send a final snapshot during cleanup after the session is deleted.
    if (!this.buffers.has(sessionId)) return;
    this.snapshots.set(sessionId, content);
    this.onDataCallback?.(sessionId);
  }

  getSnapshot(sessionId: string): string | undefined {
    return this.snapshots.get(sessionId);
  }

  replay(sessionId: string): string {
    // Prefer the serialized snapshot (clean terminal state captured by
    // SerializeAddon) over the raw ring buffer which replays all intermediate
    // escape sequences and can break if eviction splits a sequence.
    const snapshot = this.snapshots.get(sessionId);
    if (snapshot) return snapshot;
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
    this.batcher.dispose();
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
