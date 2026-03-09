import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

export type HookEventName = 'Stop' | 'PermissionRequest' | 'UserPromptSubmit';

export interface HookEvent {
  sessionId: string;
  eventName: HookEventName;
}

interface HookServerEvents {
  hook: [event: HookEvent];
}

const VALID_EVENT_NAMES = new Set<HookEventName>(['Stop', 'PermissionRequest', 'UserPromptSubmit']);

export class HookServer extends EventEmitter<HookServerEvents> {
  private server: Server | null = null;
  private port: number | null = null;

  async start(): Promise<void> {
    if (this.server) return;

    const server = createServer((req, res) => this.handleRequest(req, res));

    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      });
    });

    this.server = server;
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    const server = this.server;
    this.server = null;
    this.port = null;

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getPort(): number | null {
    return this.port;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'POST' || req.url !== '/orca-hooks') {
      res.writeHead(404);
      res.end();
      return;
    }

    const sessionId = req.headers['x-orca-session-id'];
    if (!sessionId || typeof sessionId !== 'string') {
      res.writeHead(400);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      // Respond immediately — must not block Claude
      res.writeHead(200);
      res.end();

      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch {
        return;
      }

      if (
        typeof body !== 'object' ||
        body === null ||
        !('hook_event_name' in body) ||
        typeof (body as Record<string, unknown>).hook_event_name !== 'string'
      ) {
        return;
      }

      const eventName = (body as Record<string, unknown>).hook_event_name as string;
      if (!VALID_EVENT_NAMES.has(eventName as HookEventName)) {
        return;
      }

      this.emit('hook', { sessionId, eventName: eventName as HookEventName });
    });
  }
}
