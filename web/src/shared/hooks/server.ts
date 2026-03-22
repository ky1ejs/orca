import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, type McpToolsDeps } from './mcp-tools.js';

export type HookEventName = 'Stop' | 'PermissionRequest' | 'UserPromptSubmit';

export interface HookEvent {
  sessionId: string;
  eventName: HookEventName;
}

interface HookServerEvents {
  hook: [event: HookEvent];
}

interface HookServerOptions {
  mcpDeps?: McpToolsDeps;
  preferredPort?: number;
}

const VALID_EVENT_NAMES = new Set<HookEventName>(['Stop', 'PermissionRequest', 'UserPromptSubmit']);

export class HookServer extends EventEmitter<HookServerEvents> {
  private server: Server | null = null;
  private port: number | null = null;
  private mcpDeps: McpToolsDeps | null;
  private preferredPort: number | undefined;

  constructor(options?: HookServerOptions) {
    super();
    this.mcpDeps = options?.mcpDeps ?? null;
    this.preferredPort = options?.preferredPort;
  }

  async start(): Promise<void> {
    if (this.server) return;

    const server = createServer((req, res) => this.handleRequest(req, res));

    const listenOnPort = (port: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            this.port = addr.port;
          }
          resolve();
        });
      });

    if (this.preferredPort) {
      try {
        await listenOnPort(this.preferredPort);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
          await listenOnPort(0);
        } else {
          throw err;
        }
      }
    } else {
      await listenOnPort(0);
    }

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
    const url = req.url ?? '';

    if (req.method === 'POST' && url === '/orca-hooks') {
      this.handleHookRequest(req, res);
      return;
    }

    if (url === '/mcp' && this.mcpDeps) {
      this.handleMcpRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private handleHookRequest(req: IncomingMessage, res: ServerResponse): void {
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
        // eslint-disable-next-line no-restricted-syntax -- narrowing untyped JSON body
        typeof (body as Record<string, unknown>).hook_event_name !== 'string'
      ) {
        return;
      }

      // eslint-disable-next-line no-restricted-syntax -- narrowing untyped JSON body
      const eventName = (body as Record<string, unknown>).hook_event_name as string;
      if (!VALID_EVENT_NAMES.has(eventName as HookEventName)) {
        return;
      }

      this.emit('hook', { sessionId, eventName: eventName as HookEventName });
    });
  }

  private async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionIdHeader = req.headers['x-orca-session-id'];
    this.mcpDeps?.log?.debug(
      `MCP request received (sessionId header=${sessionIdHeader ?? 'none'})`,
    );

    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed.' },
          id: null,
        }),
      );
      return;
    }

    const sessionId = typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;
    const mcpServer = createMcpServer({ ...this.mcpDeps!, sessionId });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });
    } catch {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          }),
        );
      }
    }
  }
}
