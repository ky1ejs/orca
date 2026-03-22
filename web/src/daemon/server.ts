/**
 * Unix domain socket server for the daemon.
 * Handles client connections, message routing, and NDJSON protocol.
 *
 * Broadcast events are batched: instead of writing each event immediately,
 * events are queued per-client and flushed after a short interval (~4ms).
 * Multiple pty.data events for the same session are consolidated into a
 * single message to reduce JSON serialization overhead and IPC crossings.
 */
import * as net from 'node:net';
import { randomUUID } from 'node:crypto';
import type {
  DaemonRequest,
  DaemonResponse,
  DaemonEvent,
  PtyDataEvent,
} from '../shared/daemon-protocol.js';
import { DAEMON_EVENTS } from '../shared/daemon-protocol.js';

export interface ClientConnection {
  id: string;
  socket: net.Socket;
  subscriptions: Set<string>; // sessionIds this client is subscribed to
  buffer: string;
  pendingEvents: DaemonEvent[];
  flushTimer: ReturnType<typeof setTimeout> | null;
}

type RequestHandler = (
  client: ClientConnection,
  method: string,
  params: unknown,
) => Promise<unknown>;

export class DaemonServer {
  private static readonly BATCH_INTERVAL_MS = 4;

  private server: net.Server | null = null;
  private clients = new Map<string, ClientConnection>();
  private handler: RequestHandler;
  private onClientCountChange: ((count: number) => void) | null = null;

  constructor(handler: RequestHandler) {
    this.handler = handler;
  }

  setOnClientCountChange(cb: (count: number) => void): void {
    this.onClientCountChange = cb;
  }

  start(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(socketPath, () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const [, client] of this.clients) {
        this.flushClient(client);
        client.socket.destroy();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast an event to all connected clients that are subscribed to the given sessionId.
   * If sessionId is null, broadcast to all clients.
   *
   * Events are not written immediately — they are queued per-client and
   * flushed after BATCH_INTERVAL_MS. Multiple pty.data events for the same
   * session are consolidated into a single message on flush.
   */
  broadcastToSubscribed(sessionId: string | null, event: string, params: unknown): void {
    for (const [, client] of this.clients) {
      if (sessionId === null || client.subscriptions.has(sessionId)) {
        this.enqueueEvent(client, event, params);
      }
    }
  }

  /**
   * Broadcast an event to all connected clients (no subscription filter).
   */
  broadcastToAll(event: string, params: unknown): void {
    this.broadcastToSubscribed(null, event, params);
  }

  subscribeClient(clientId: string, sessionId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(sessionId);
    }
  }

  unsubscribeClient(clientId: string, sessionId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.delete(sessionId);
    }
  }

  private handleConnection(socket: net.Socket): void {
    const client: ClientConnection = {
      id: randomUUID(),
      socket,
      subscriptions: new Set(),
      buffer: '',
      pendingEvents: [],
      flushTimer: null,
    };

    this.clients.set(client.id, client);
    this.onClientCountChange?.(this.clients.size);

    socket.on('data', (data) => {
      client.buffer += data.toString();
      this.processBuffer(client);
    });

    socket.on('close', () => {
      this.flushClient(client);
      this.clients.delete(client.id);
      this.onClientCountChange?.(this.clients.size);
    });

    socket.on('error', () => {
      this.cancelClientFlush(client);
      this.clients.delete(client.id);
      this.onClientCountChange?.(this.clients.size);
    });
  }

  private processBuffer(client: ClientConnection): void {
    const lines = client.buffer.split('\n');
    client.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg = JSON.parse(line) as DaemonRequest;
        this.handleRequest(client, msg);
      } catch {
        // Malformed JSON — ignore
      }
    }
  }

  private async handleRequest(client: ClientConnection, request: DaemonRequest): Promise<void> {
    try {
      const result = await this.handler(client, request.method, request.params);
      const response: DaemonResponse = { id: request.id, result: result ?? null };
      this.safeWrite(client, JSON.stringify(response) + '\n');
    } catch (err) {
      const response: DaemonResponse = {
        id: request.id,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
      this.safeWrite(client, JSON.stringify(response) + '\n');
    }
  }

  // ─── Broadcast batching ─────────────────────────────────────────────

  private enqueueEvent(client: ClientConnection, event: string, params: unknown): void {
    client.pendingEvents.push({ event, params });

    if (client.flushTimer === null) {
      client.flushTimer = setTimeout(() => {
        this.flushClient(client);
      }, DaemonServer.BATCH_INTERVAL_MS);
    }
  }

  private flushClient(client: ClientConnection): void {
    if (client.flushTimer !== null) {
      clearTimeout(client.flushTimer);
      client.flushTimer = null;
    }

    const events = client.pendingEvents;
    if (events.length === 0) return;
    client.pendingEvents = [];

    const consolidated = DaemonServer.consolidateEvents(events);

    let batch = '';
    for (const evt of consolidated) {
      batch += JSON.stringify(evt) + '\n';
    }

    this.safeWrite(client, batch);
  }

  private cancelClientFlush(client: ClientConnection): void {
    if (client.flushTimer !== null) {
      clearTimeout(client.flushTimer);
      client.flushTimer = null;
    }
    client.pendingEvents = [];
  }

  /**
   * Merge multiple pty.data events for the same session into one by
   * concatenating their data strings. The merged event appears at the
   * position of its first occurrence. Non-pty.data events pass through
   * unchanged. Overall event order is preserved.
   */
  // Public for testability
  static consolidateEvents(events: DaemonEvent[]): DaemonEvent[] {
    const ptyDataIndex = new Map<string, number>();
    const result: DaemonEvent[] = [];

    for (const evt of events) {
      if (evt.event === DAEMON_EVENTS.PTY_DATA) {
        const p = evt.params as PtyDataEvent;
        const existingIdx = ptyDataIndex.get(p.sessionId);
        if (existingIdx !== undefined) {
          const existing = result[existingIdx].params as PtyDataEvent;
          result[existingIdx] = {
            event: DAEMON_EVENTS.PTY_DATA,
            params: { sessionId: p.sessionId, data: existing.data + p.data },
          };
        } else {
          ptyDataIndex.set(p.sessionId, result.length);
          result.push({
            event: DAEMON_EVENTS.PTY_DATA,
            params: { sessionId: p.sessionId, data: p.data },
          });
        }
      } else {
        result.push(evt);
      }
    }

    return result;
  }

  private safeWrite(client: ClientConnection, data: string): void {
    try {
      if (!client.socket.destroyed) {
        client.socket.write(data);
      }
    } catch {
      // Client disconnected
    }
  }
}
