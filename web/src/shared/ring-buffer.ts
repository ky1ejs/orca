import { visibleLength } from './ansi.js';

interface ChunkMeta {
  data: string;
  rawLen: number;
  visLen: number;
}

/**
 * In-memory ring buffer for terminal output chunks.
 * Replaces SQLite-backed output-buffer on the daemon hot path,
 * making append O(1) and tail reads O(1) via a running tail string.
 */
export class RingBuffer {
  static readonly MAX_SIZE = 1024 * 1024; // 1MB (measured in UTF-16 code units)
  private static readonly TARGET_SIZE = Math.floor(RingBuffer.MAX_SIZE * 0.75);
  private static readonly HEAD_KEEP = 64 * 1024; // 64KB
  static readonly TRUNCATION_MARKER = '\r\n\x1b[2m[...output truncated...]\x1b[0m\r\n';
  private static readonly MARKER_RAW_LEN = RingBuffer.TRUNCATION_MARKER.length;
  private static readonly MARKER_VIS_LEN = visibleLength(RingBuffer.TRUNCATION_MARKER);

  private chunks: ChunkMeta[] = [];
  private rawSize = 0;
  private _visibleSize = 0;
  private _tail = '';
  private readonly tailMaxLen = 2000;

  append(data: string): void {
    const rawLen = data.length;
    const visLen = visibleLength(data);
    this.chunks.push({ data, rawLen, visLen });
    this.rawSize += rawLen;
    this._visibleSize += visLen;
    this._tail = (this._tail + data).slice(-this.tailMaxLen);

    if (this.rawSize > RingBuffer.MAX_SIZE) {
      this.evict();
    }
  }

  replay(): string {
    return this.chunks.map((c) => c.data).join('');
  }

  tail(n: number): string {
    return this._tail.slice(-n);
  }

  get size(): number {
    return this.rawSize;
  }

  get visibleSize(): number {
    return this._visibleSize;
  }

  clear(): void {
    this.chunks = [];
    this.rawSize = 0;
    this._visibleSize = 0;
    this._tail = '';
  }

  /** Keep first N chunks (command context) + last M chunks (recent output), evict the middle. */
  private evict(): void {
    // Walk forward: keep whole chunks up to HEAD_KEEP (always keep at least 1)
    let headRaw = 0;
    let headVis = 0;
    let headEnd = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      if (headRaw + this.chunks[i].rawLen > RingBuffer.HEAD_KEEP && headEnd > 0) break;
      headRaw += this.chunks[i].rawLen;
      headVis += this.chunks[i].visLen;
      headEnd = i + 1;
    }

    // Walk backward: keep whole chunks up to remaining budget
    const tailKeep = RingBuffer.TARGET_SIZE - headRaw;
    let tailRaw = 0;
    let tailVis = 0;
    let tailStart = this.chunks.length;
    for (let i = this.chunks.length - 1; i >= headEnd; i--) {
      if (tailRaw + this.chunks[i].rawLen > tailKeep) break;
      tailRaw += this.chunks[i].rawLen;
      tailVis += this.chunks[i].visLen;
      tailStart = i;
    }

    if (tailStart <= headEnd) return;

    const markerChunk: ChunkMeta = {
      data: RingBuffer.TRUNCATION_MARKER,
      rawLen: RingBuffer.MARKER_RAW_LEN,
      visLen: RingBuffer.MARKER_VIS_LEN,
    };

    this.chunks.splice(headEnd, tailStart - headEnd, markerChunk);
    this.rawSize = headRaw + tailRaw + markerChunk.rawLen;
    this._visibleSize = Math.max(0, headVis + tailVis + markerChunk.visLen);
  }
}
