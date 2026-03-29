/**
 * Batches PTY onData events and flushes on a timer or size threshold.
 * Implements end-to-end watermark-based flow control: pauses PTY reads
 * when unacknowledged downstream bytes exceed HIGH watermark, resumes
 * when renderer ACKs bring them below LOW watermark.
 */

interface DataBatcherOptions {
  /** Flush interval in milliseconds. Default: 4. */
  flushIntervalMs?: number;
  /** Accumulated size (UTF-16 code units) per session before forcing an immediate flush. Default: 64KB. */
  sizeThreshold?: number;
  /** Pause PTY when unacked bytes exceed this (UTF-16 code units). Default: 512KB. */
  highWatermark?: number;
  /** Resume PTY when unacked bytes drop below this (UTF-16 code units). Default: 128KB. */
  lowWatermark?: number;
}

/** Maximum time (ms) a session can stay paused before the safety valve resets it. */
const STUCK_PAUSE_TIMEOUT_MS = 30_000;

interface SessionBatchState {
  chunks: string[];
  pendingSize: number;
  unackedSize: number;
  paused: boolean;
  /** Timestamp when the session was paused, or 0 if not paused. */
  pausedAt: number;
}

type FlushCallback = (sessionId: string, data: string) => void;
type FlowCallback = (sessionId: string) => void;

export class DataBatcher {
  private readonly flushIntervalMs: number;
  private readonly sizeThreshold: number;
  private readonly highWatermark: number;
  private readonly lowWatermark: number;

  private sessions = new Map<string, SessionBatchState>();
  private flushCb: FlushCallback | null = null;
  private pauseCb: FlowCallback | null = null;
  private resumeCb: FlowCallback | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(options?: DataBatcherOptions) {
    this.flushIntervalMs = options?.flushIntervalMs ?? 4;
    this.sizeThreshold = options?.sizeThreshold ?? 64 * 1024;
    this.highWatermark = options?.highWatermark ?? 512 * 1024;
    this.lowWatermark = options?.lowWatermark ?? 128 * 1024;

    this.timer = setInterval(() => this.flushAll(), this.flushIntervalMs);
  }

  onFlush(cb: FlushCallback): void {
    this.flushCb = cb;
  }

  onPause(cb: FlowCallback): void {
    this.pauseCb = cb;
  }

  onResume(cb: FlowCallback): void {
    this.resumeCb = cb;
  }

  push(sessionId: string, data: string): void {
    if (this.disposed || data.length === 0) return;

    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { chunks: [], pendingSize: 0, unackedSize: 0, paused: false, pausedAt: 0 };
      this.sessions.set(sessionId, state);
    }

    state.chunks.push(data);
    state.pendingSize += data.length;

    if (state.pendingSize >= this.sizeThreshold) {
      this.flushSession(sessionId, state);
    }
  }

  /** Acknowledge that the renderer has processed `bytes` of data. */
  ack(sessionId: string, bytes: number): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    state.unackedSize = Math.max(0, state.unackedSize - bytes);

    if (state.paused && state.unackedSize < this.lowWatermark) {
      state.paused = false;
      state.pausedAt = 0;
      this.resumeCb?.(sessionId);
    }
  }

  /** Reset unacked state for a session (e.g. after client reconnect or replay). */
  resetUnacked(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.unackedSize = 0;
    if (state.paused) {
      state.paused = false;
      state.pausedAt = 0;
      this.resumeCb?.(sessionId);
    }
  }

  /** Flush any pending data for a session and remove it. */
  flushAndRemove(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      if (state.chunks.length > 0) {
        this.flushSession(sessionId, state);
      }
      // Unpause PTY before removing state — otherwise a paused PTY stays
      // paused forever if the renderer disconnects without ACKing.
      if (state.paused) this.resumeCb?.(sessionId);
    }
    this.sessions.delete(sessionId);
  }

  remove(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state?.paused) this.resumeCb?.(sessionId);
    this.sessions.delete(sessionId);
  }

  flushAll(): void {
    const now = Date.now();
    for (const [sessionId, state] of this.sessions) {
      if (state.chunks.length > 0) {
        this.flushSession(sessionId, state);
      }

      // Safety valve: auto-resume sessions stuck in paused state.
      // Normal pauses last < 1 flush cycle (~4ms). A pause lasting 30+ seconds
      // means ACKs were lost (e.g. renderer unmounted with in-flight IPC data).
      if (state.paused && now - state.pausedAt >= STUCK_PAUSE_TIMEOUT_MS) {
        state.unackedSize = 0;
        state.paused = false;
        state.pausedAt = 0;
        this.resumeCb?.(sessionId);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flushAll();
    this.sessions.clear();
  }

  private flushSession(sessionId: string, state: SessionBatchState): void {
    const batch = state.chunks.length === 1 ? state.chunks[0] : state.chunks.join('');
    state.chunks = [];
    state.pendingSize = 0;
    state.unackedSize += batch.length;

    this.flushCb?.(sessionId, batch);

    // Pause PTY when unacked downstream data exceeds the high watermark.
    if (!state.paused && state.unackedSize >= this.highWatermark) {
      state.paused = true;
      state.pausedAt = Date.now();
      this.pauseCb?.(sessionId);
    }
  }
}
