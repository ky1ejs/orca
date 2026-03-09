/**
 * Unix domain socket server for the daemon.
 * Handles client connections, message routing, and NDJSON protocol.
 */
import * as net from 'node:net';
import { randomUUID } from 'node:crypto';
import type { DaemonRequest, DaemonResponse, DaemonEvent } from '../shared/daemon-protocol.js';

export interface ClientConnection {
  id: string;
  socket: net.Socket;
  subscriptions: Set<string>; // sessionIds this client is subscribed to
  buffer: string;
}

type RequestHandler = (
  client: ClientConnection,
  method: string,
  params: unknown,
) => Promise<unknown>;

export class DaemonServer {
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
      // Close all client connections
      for (const [, client] of this.clients) {
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
   */
  broadcastToSubscribed(sessionId: string | null, event: string, params: unknown): void {
    const msg: DaemonEvent = { event, params };
    const line = JSON.stringify(msg) + '\n';

    for (const [, client] of this.clients) {
      if (sessionId === null || client.subscriptions.has(sessionId)) {
        this.safeWrite(client, line);
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
    };

    this.clients.set(client.id, client);
    this.onClientCountChange?.(this.clients.size);

    socket.on('data', (data) => {
      client.buffer += data.toString();
      this.processBuffer(client);
    });

    socket.on('close', () => {
      this.clients.delete(client.id);
      this.onClientCountChange?.(this.clients.size);
    });

    socket.on('error', () => {
      this.clients.delete(client.id);
      this.onClientCountChange?.(this.clients.size);
    });
  }

  private processBuffer(client: ClientConnection): void {
    const lines = client.buffer.split('\n');
    // Keep the last incomplete line in the buffer
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
