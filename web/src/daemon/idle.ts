/**
 * Auto-exit logic: shuts down daemon after idle timeout
 * if no clients are connected and no sessions are active.
 */

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class IdleManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private getClientCount: () => number;
  private getActiveSessionCount: () => number;
  private onIdle: () => void;

  constructor(
    getClientCount: () => number,
    getActiveSessionCount: () => number,
    onIdle: () => void,
  ) {
    this.getClientCount = getClientCount;
    this.getActiveSessionCount = getActiveSessionCount;
    this.onIdle = onIdle;
  }

  /**
   * Called when client count or session count changes.
   * Starts or resets the idle timer as appropriate.
   */
  check(): void {
    const clients = this.getClientCount();
    const sessions = this.getActiveSessionCount();

    if (clients === 0 && sessions === 0) {
      // Start idle countdown if not already running
      if (!this.timer) {
        this.timer = setTimeout(() => {
          // Double-check before shutting down
          if (this.getClientCount() === 0 && this.getActiveSessionCount() === 0) {
            this.onIdle();
          } else {
            this.timer = null;
            this.check();
          }
        }, IDLE_TIMEOUT_MS);
      }
    } else {
      // Activity detected — cancel idle timer
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
