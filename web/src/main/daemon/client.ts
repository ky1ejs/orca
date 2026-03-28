/**
 * DaemonClient: connects to the PTY daemon over a Unix domain socket.
 * Handles request/response correlation and event dispatch.
 */
import * as net from 'node:net';
import { randomUUID } from 'node:crypto';
import type { DaemonRequest, DaemonMessage } from '../../shared/daemon-protocol.js';
import { isDaemonEvent, isDaemonResponse } from '../../shared/daemon-protocol.js';

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 30_000;

export class DaemonClient {
  private socket: net.Socket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<(params: unknown) => void>>();
  private buffer = '';
  private _connected = false;
  private onDisconnect: (() => void) | null = null;

  get connected(): boolean {
    return this._connected;
  }

  setOnDisconnect(cb: () => void): void {
    this.onDisconnect = cb;
  }

  connect(socketPath: string): Promise<void> {
    // Clean up any existing socket before creating a new connection
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
      this._connected = false;
    }
    this.buffer = '';

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(socketPath, () => {
        this._connected = true;
        resolve();
      });

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.socket.on('close', () => {
        this._connected = false;
        this.rejectAllPending('Connection closed');
        this.onDisconnect?.();
      });

      this.socket.on('error', (err) => {
        if (!this._connected) {
          reject(err);
        } else {
          this._connected = false;
          this.rejectAllPending(`Connection error: ${err.message}`);
          this.onDisconnect?.();
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this._connected = false;
      this.rejectAllPending('Client disconnected');
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.socket || !this._connected) {
      throw new Error('Not connected to daemon');
    }

    const id = randomUUID();
    const msg: DaemonRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      this.socket!.write(JSON.stringify(msg) + '\n');
    });
  }

  /**
   * Fire-and-forget: send a message to the daemon without waiting for a response.
   * No UUID, no timeout, no pending entry — suitable for high-frequency signals like ACKs.
   */
  notify(method: string, params?: unknown): void {
    if (!this.socket || !this._connected) return;
    try {
      this.socket.write(JSON.stringify({ method, params }) + '\n');
    } catch {
      // Disconnected — ignore
    }
  }

  /**
   * Subscribe to daemon events. Returns an unsubscribe function.
   */
  subscribe(event: string, handler: (params: unknown) => void): () => void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        this.eventHandlers.delete(event);
      }
    };
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg = JSON.parse(line) as DaemonMessage;
        this.handleMessage(msg);
      } catch {
        // Malformed JSON — ignore
      }
    }
  }

  private handleMessage(msg: DaemonMessage): void {
    if (isDaemonResponse(msg)) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) {
          pending.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (isDaemonEvent(msg)) {
      const handlers = this.eventHandlers.get(msg.event);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(msg.params);
          } catch {
            // Don't let handler errors crash the client
          }
        }
      }
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}
