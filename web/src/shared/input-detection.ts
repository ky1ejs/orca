const DEFAULT_PATTERNS = [
  /\?\s*$/,
  /\(y\/N\)\s*$/i,
  /\(Y\/n\)\s*$/i,
  />\s*$/,
  /Press Enter/i,
  /\[yes\/no\]\s*$/i,
  /\(yes\/no\)\s*$/i,
  /Continue\?/i,
];

export class InputDetector {
  private patterns: RegExp[];
  private debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastChunk = '';
  private waiting = false;
  private onChange: ((waiting: boolean) => void) | null = null;

  constructor(patterns?: RegExp[], debounceMs = 500) {
    this.patterns = patterns ?? DEFAULT_PATTERNS;
    this.debounceMs = debounceMs;
  }

  onOutput(data: string): void {
    this.lastChunk = data;
    const matches = this.patterns.some((p) => p.test(data));

    if (matches) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.waiting) {
          this.waiting = true;
          this.onChange?.(true);
        }
      }, this.debounceMs);
    } else {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.waiting) {
        this.waiting = false;
        this.onChange?.(false);
      }
    }
  }

  setOnChange(cb: (waiting: boolean) => void): void {
    this.onChange = cb;
  }

  isWaiting(): boolean {
    return this.waiting;
  }

  getLastChunk(): string {
    return this.lastChunk;
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onChange = null;
  }
}
