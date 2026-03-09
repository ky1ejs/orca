import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type Server } from 'node:http';
import { createMcpServer, type McpToolsDeps } from './mcp-tools.js';

vi.mock('../../daemon/sessions.js', () => ({
  getSession: vi.fn(),
}));

import { getSession } from '../../daemon/sessions.js';
const mockGetSession = vi.mocked(getSession);

describe('MCP tools', () => {
  let httpServer: Server;
  let serverPort: number;
  let deps: McpToolsDeps;

  beforeEach(async () => {
    deps = {
      backendUrl: 'http://localhost:0', // will be overwritten per test
      getToken: () => 'test-token',
    };

    // Start HTTP server to host the MCP endpoint
    httpServer = createServer(async (req, res) => {
      const mcpServer = createMcpServer(deps);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    vi.restoreAllMocks();
  });

  async function callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const client = new Client({ name: 'test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${serverPort}/`));
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args });
    await client.close();
    return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
  }

  describe('get_current_task', () => {
    it('returns error when session not found', async () => {
      mockGetSession.mockReturnValue(undefined);
      const result = await callTool('get_current_task', { sessionId: 'nonexistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No task is associated');
    });

    it('returns error when no token', async () => {
      mockGetSession.mockReturnValue({
        id: 'sess-1',
        task_id: 'task-uuid',
        pid: 1234,
        status: 'running',
        working_directory: '/tmp',
        started_at: new Date().toISOString(),
        stopped_at: null,
        created_at: new Date().toISOString(),
      });
      deps.getToken = () => null;

      const result = await callTool('get_current_task', { sessionId: 'sess-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('fetches task from backend and returns it', async () => {
      const mockTask = {
        id: 'task-uuid',
        displayId: 'ORCA-42',
        title: 'Test task',
        description: null,
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        project: null,
        assignee: null,
        labels: [],
      };

      // Set up a mock backend
      const backendServer = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: { task: mockTask } }));
        });
      });
      await new Promise<void>((resolve) => {
        backendServer.listen(0, '127.0.0.1', () => resolve());
      });
      const backendAddr = backendServer.address();
      const backendPort = typeof backendAddr === 'object' && backendAddr ? backendAddr.port : 0;
      deps.backendUrl = `http://127.0.0.1:${backendPort}`;

      mockGetSession.mockReturnValue({
        id: 'sess-1',
        task_id: 'task-uuid',
        pid: 1234,
        status: 'running',
        working_directory: '/tmp',
        started_at: new Date().toISOString(),
        stopped_at: null,
        created_at: new Date().toISOString(),
      });

      const result = await callTool('get_current_task', { sessionId: 'sess-1' });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.displayId).toBe('ORCA-42');
      expect(parsed.title).toBe('Test task');

      await new Promise<void>((resolve, reject) => {
        backendServer.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });

  describe('update_task_status', () => {
    it('returns error when session not found', async () => {
      mockGetSession.mockReturnValue(undefined);
      const result = await callTool('update_task_status', {
        sessionId: 'nonexistent',
        status: 'DONE',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No task is associated');
    });

    it('sends mutation to backend and returns success', async () => {
      let receivedBody: string = '';

      const backendServer = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          receivedBody = body;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: { updateTask: { id: 'task-uuid', status: 'DONE' } } }));
        });
      });
      await new Promise<void>((resolve) => {
        backendServer.listen(0, '127.0.0.1', () => resolve());
      });
      const backendAddr = backendServer.address();
      const backendPort = typeof backendAddr === 'object' && backendAddr ? backendAddr.port : 0;
      deps.backendUrl = `http://127.0.0.1:${backendPort}`;

      mockGetSession.mockReturnValue({
        id: 'sess-1',
        task_id: 'task-uuid',
        pid: 1234,
        status: 'running',
        working_directory: '/tmp',
        started_at: new Date().toISOString(),
        stopped_at: null,
        created_at: new Date().toISOString(),
      });

      const result = await callTool('update_task_status', {
        sessionId: 'sess-1',
        status: 'DONE',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Task status updated to DONE');

      const parsed = JSON.parse(receivedBody);
      expect(parsed.variables.id).toBe('task-uuid');
      expect(parsed.variables.input.status).toBe('DONE');

      await new Promise<void>((resolve, reject) => {
        backendServer.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });
});
