import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { HookServer, type HookEvent } from './server.js';

vi.mock('../../daemon/sessions.js', () => ({
  getSession: vi.fn(),
}));

import { getSession } from '../../daemon/sessions.js';
const mockGetSession = vi.mocked(getSession);

describe('HookServer', () => {
  let server: HookServer;

  beforeEach(async () => {
    server = new HookServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  function url(path = '/orca-hooks'): string {
    return `http://127.0.0.1:${server.getPort()}${path}`;
  }

  function post(
    body: unknown,
    headers: Record<string, string> = {},
    path = '/orca-hooks',
  ): Promise<Response> {
    return fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  function collectEvents(timeout = 100): Promise<HookEvent[]> {
    const events: HookEvent[] = [];
    server.on('hook', (e) => events.push(e));
    return new Promise((resolve) => setTimeout(() => resolve(events), timeout));
  }

  it('starts on random port', () => {
    const port = server.getPort();
    expect(port).toBeGreaterThan(0);
  });

  it('POST with valid session header and body emits hook event', async () => {
    const eventsPromise = collectEvents();
    const res = await post({ hook_event_name: 'Stop' }, { 'X-Orca-Session-Id': 'sess-123' });
    expect(res.status).toBe(200);

    const events = await eventsPromise;
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId: 'sess-123', eventName: 'Stop' });
  });

  it('POST without X-Orca-Session-Id header returns 400', async () => {
    const eventsPromise = collectEvents();
    const res = await post({ hook_event_name: 'Stop' });
    expect(res.status).toBe(400);

    const events = await eventsPromise;
    expect(events).toHaveLength(0);
  });

  it('POST with invalid JSON body returns 200 but does not emit event', async () => {
    const eventsPromise = collectEvents();
    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'X-Orca-Session-Id': 'sess-123' },
      body: 'not-json{{{',
    });
    expect(res.status).toBe(200);

    const events = await eventsPromise;
    expect(events).toHaveLength(0);
  });

  it('GET /orca-hooks returns 404', async () => {
    const res = await fetch(url(), { method: 'GET' });
    expect(res.status).toBe(404);
  });

  it('POST to wrong path returns 404', async () => {
    const res = await post(
      { hook_event_name: 'Stop' },
      { 'X-Orca-Session-Id': 'sess-123' },
      '/wrong-path',
    );
    expect(res.status).toBe(404);
  });

  it('stop() releases port', async () => {
    const port = server.getPort();
    expect(port).toBeGreaterThan(0);

    await server.stop();
    expect(server.getPort()).toBeNull();

    // Verify the port is released by starting a new server on the same port
    // (or just verify the server is no longer listening)
    await expect(fetch(url())).rejects.toThrow();
  });

  it('emits Stop event correctly', async () => {
    const eventsPromise = collectEvents();
    await post({ hook_event_name: 'Stop' }, { 'X-Orca-Session-Id': 'sess-1' });
    const events = await eventsPromise;
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId: 'sess-1', eventName: 'Stop' });
  });

  it('emits PermissionRequest event correctly', async () => {
    const eventsPromise = collectEvents();
    await post({ hook_event_name: 'PermissionRequest' }, { 'X-Orca-Session-Id': 'sess-2' });
    const events = await eventsPromise;
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId: 'sess-2', eventName: 'PermissionRequest' });
  });

  it('emits UserPromptSubmit event correctly', async () => {
    const eventsPromise = collectEvents();
    await post({ hook_event_name: 'UserPromptSubmit' }, { 'X-Orca-Session-Id': 'sess-3' });
    const events = await eventsPromise;
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId: 'sess-3', eventName: 'UserPromptSubmit' });
  });

  it('invalid event name in body does not emit event', async () => {
    const eventsPromise = collectEvents();
    const res = await post({ hook_event_name: 'InvalidEvent' }, { 'X-Orca-Session-Id': 'sess-4' });
    expect(res.status).toBe(200);

    const events = await eventsPromise;
    expect(events).toHaveLength(0);
  });
});

describe('HookServer MCP endpoint', () => {
  let hookServer: HookServer;
  let port: number;

  beforeEach(async () => {
    hookServer = new HookServer({
      mcpDeps: {
        backendUrl: 'http://localhost:0',
        getToken: () => 'test-token',
      },
    });
    await hookServer.start();
    port = hookServer.getPort()!;
  });

  afterEach(async () => {
    await hookServer.stop();
    vi.restoreAllMocks();
  });

  async function callToolWithHeader(
    toolName: string,
    args: Record<string, unknown>,
    sessionId?: string,
  ) {
    const client = new Client({ name: 'test', version: '1.0.0' });
    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['X-Orca-Session-Id'] = sessionId;
    }
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
      { requestInit: { headers } },
    );
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    await client.close();
    return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
  }

  it('passes X-Orca-Session-Id header to MCP tools as sessionId', async () => {
    mockGetSession.mockReturnValue({
      id: 'sess-from-header',
      task_id: 'task-uuid',
      pid: 1234,
      status: 'running',
      working_directory: '/tmp',
      started_at: new Date().toISOString(),
      stopped_at: null,
      created_at: new Date().toISOString(),
    });

    const result = await callToolWithHeader('get_current_task', {}, 'sess-from-header');

    expect(mockGetSession).toHaveBeenCalledWith('sess-from-header');
    // Backend is unreachable (port 0), but session was resolved — confirms header was forwarded
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to reach Orca backend');
  });

  it('returns error when X-Orca-Session-Id header is missing', async () => {
    const result = await callToolWithHeader('get_current_task', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No session ID provided');
  });
});
