/**
 * Batches PTY onData events and flushes on a timer or size threshold.
 * Implements watermark-based flow control: pauses PTY reads at HIGH
 * watermark, resumes at LOW watermark.
 */

interface DataBatcherOptions {
  /** Flush interval in milliseconds. Default: 4. */
  flushIntervalMs?: number;
  /** Accumulated bytes per session before forcing an immediate flush. Default: 64KB. */
  sizeThresholdBytes?: number;
  /** Pause PTY when pending data exceeds this. Default: 512KB. */
  highWatermark?: number;
  /** Resume PTY when pending data drops below this after flush. Default: 128KB. */
  lowWatermark?: number;
}

interface SessionBatchState {
  chunks: string[];
  pendingSize: number;
  paused: boolean;
}

type FlushCallback = (sessionId: string, data: string) => void;
type FlowCallback = (sessionId: string) => void;

export class DataBatcher {
  private readonly flushIntervalMs: number;
  private readonly sizeThresholdBytes: number;
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
    this.sizeThresholdBytes = options?.sizeThresholdBytes ?? 64 * 1024;
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
      state = { chunks: [], pendingSize: 0, paused: false };
      this.sessions.set(sessionId, state);
    }

    state.chunks.push(data);
    state.pendingSize += data.length;

    // Check watermark before flush — flush resets pendingSize to 0,
    // so the pause signal must fire while the size is still accurate.
    if (!state.paused && state.pendingSize >= this.highWatermark) {
      state.paused = true;
      this.pauseCb?.(sessionId);
    }

    if (state.pendingSize >= this.sizeThresholdBytes) {
      this.flushSession(sessionId, state);
    }
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  flushAll(): void {
    for (const [sessionId, state] of this.sessions) {
      if (state.chunks.length > 0) {
        this.flushSession(sessionId, state);
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

    this.flushCb?.(sessionId, batch);

    if (state.paused && state.pendingSize < this.lowWatermark) {
      state.paused = false;
      this.resumeCb?.(sessionId);
    }
  }
}
