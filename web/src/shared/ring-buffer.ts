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

  private evict(): void {
    const toDelete = Math.max(1, Math.floor(this.chunks.length * 0.25));
    for (let i = 0; i < toDelete; i++) {
      const chunk = this.chunks[i];
      this.rawSize -= chunk.rawLen;
      this._visibleSize -= chunk.visLen;
    }
    this.chunks.splice(0, toDelete);
    this._visibleSize = Math.max(0, this._visibleSize);
  }
}
