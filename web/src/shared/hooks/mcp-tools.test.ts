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
    it('returns error when no session ID in deps', async () => {
      const result = await callTool('get_current_task', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No session ID provided');
    });

    it('returns error when session not found', async () => {
      mockGetSession.mockReturnValue(undefined);
      deps.sessionId = 'nonexistent';
      const result = await callTool('get_current_task', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session not found: nonexistent');
    });

    it('returns error when session has no task_id', async () => {
      mockGetSession.mockReturnValue({
        id: 'sess-no-task',
        task_id: null,
        pid: 1234,
        status: 'running',
        working_directory: '/tmp',
        started_at: new Date().toISOString(),
        stopped_at: null,
        created_at: new Date().toISOString(),
      });
      deps.sessionId = 'sess-no-task';
      const result = await callTool('get_current_task', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No task is associated with session: sess-no-task');
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
      deps.sessionId = 'sess-1';

      const result = await callTool('get_current_task', {});
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
      deps.sessionId = 'sess-1';

      await withMockBackend({ task: mockTask }, async () => {
        const result = await callTool('get_current_task', {});
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.displayId).toBe('ORCA-42');
        expect(parsed.title).toBe('Test task');
      });
    });
  });

  describe('update_task_status', () => {
    it('returns error when no session ID in deps', async () => {
      const result = await callTool('update_task_status', { status: 'DONE' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No session ID provided');
    });

    it('returns error when session not found', async () => {
      mockGetSession.mockReturnValue(undefined);
      deps.sessionId = 'nonexistent';
      const result = await callTool('update_task_status', {
        status: 'DONE',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session not found: nonexistent');
    });

    it('sends mutation to backend and returns success', async () => {
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
      deps.sessionId = 'sess-1';

      await withMockBackend(
        { updateTask: { id: 'task-uuid', status: 'DONE' } },
        async (received) => {
          const result = await callTool('update_task_status', {
            status: 'DONE',
          });

          expect(result.isError).toBeUndefined();
          expect(result.content[0].text).toContain('Task status updated to DONE');

          const parsed = JSON.parse(received.body());
          expect(parsed.variables.id).toBe('task-uuid');
          expect(parsed.variables.input.status).toBe('DONE');
        },
      );
    });
  });

  // Helper to start a mock backend that returns a canned response.
  // Pass `{ raw: ... }` to return an arbitrary JSON response (e.g. GraphQL errors).
  async function withMockBackend(
    response: Record<string, unknown> | { raw: unknown },
    fn: (received: { body: () => string }) => Promise<void>,
  ): Promise<void> {
    const jsonResponse = 'raw' in response ? response.raw : { data: response };
    let receivedBody = '';
    const backendServer = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        receivedBody = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jsonResponse));
      });
    });
    await new Promise<void>((resolve) => {
      backendServer.listen(0, '127.0.0.1', () => resolve());
    });
    const backendAddr = backendServer.address();
    const backendPort = typeof backendAddr === 'object' && backendAddr ? backendAddr.port : 0;
    deps.backendUrl = `http://127.0.0.1:${backendPort}`;

    try {
      await fn({ body: () => receivedBody });
    } finally {
      await new Promise<void>((resolve, reject) => {
        backendServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }

  describe('list_workspaces', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('list_workspaces', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns workspaces from backend', async () => {
      const mockWorkspaces = [
        { id: 'ws-1', name: 'My Workspace', slug: 'my-workspace' },
        { id: 'ws-2', name: 'Other Workspace', slug: 'other' },
      ];

      await withMockBackend({ workspaces: mockWorkspaces }, async () => {
        const result = await callTool('list_workspaces', {});
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].slug).toBe('my-workspace');
      });
    });

    it('returns error on GraphQL errors', async () => {
      await withMockBackend({ raw: { errors: [{ message: 'Unauthorized' }] } }, async () => {
        const result = await callTool('list_workspaces', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to list workspaces');
      });
    });
  });

  describe('list_initiatives', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('list_initiatives', { workspaceSlug: 'my-ws' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns initiatives from backend', async () => {
      const mockInitiatives = [{ id: 'init-1', name: 'Phase 1', description: 'First phase' }];

      await withMockBackend({ workspace: { initiatives: mockInitiatives } }, async () => {
        const result = await callTool('list_initiatives', { workspaceSlug: 'my-ws' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe('Phase 1');
      });
    });
  });

  describe('list_projects', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('list_projects', { workspaceSlug: 'my-ws' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns projects from backend', async () => {
      const mockProjects = [
        { id: 'proj-1', name: 'Backend', description: null, initiativeId: 'init-1' },
      ];

      await withMockBackend({ workspace: { projects: mockProjects } }, async () => {
        const result = await callTool('list_projects', { workspaceSlug: 'my-ws' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe('Backend');
        expect(parsed[0].initiativeId).toBe('init-1');
      });
    });
  });

  describe('create_initiative', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('create_initiative', {
        workspaceId: 'ws-1',
        name: 'New Initiative',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('creates initiative and returns result', async () => {
      const created = { id: 'init-new', name: 'New Initiative', description: 'A desc' };

      await withMockBackend({ createInitiative: created }, async (received) => {
        const result = await callTool('create_initiative', {
          workspaceId: 'ws-1',
          name: 'New Initiative',
          description: 'A desc',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe('init-new');
        expect(parsed.name).toBe('New Initiative');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.input.workspaceId).toBe('ws-1');
        expect(sentVars.input.name).toBe('New Initiative');
        expect(sentVars.input.description).toBe('A desc');
      });
    });
  });

  describe('create_project', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('create_project', {
        workspaceId: 'ws-1',
        name: 'New Project',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('creates project with initiativeId and returns result', async () => {
      const created = {
        id: 'proj-new',
        name: 'New Project',
        description: null,
        initiativeId: 'init-1',
      };

      await withMockBackend({ createProject: created }, async (received) => {
        const result = await callTool('create_project', {
          workspaceId: 'ws-1',
          name: 'New Project',
          initiativeId: 'init-1',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe('proj-new');
        expect(parsed.initiativeId).toBe('init-1');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.input.workspaceId).toBe('ws-1');
        expect(sentVars.input.initiativeId).toBe('init-1');
      });
    });
  });

  describe('create_task', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('create_task', {
        workspaceId: 'ws-1',
        title: 'New Task',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('creates task with optional fields and returns result', async () => {
      const created = {
        id: 'task-new',
        displayId: 'ORCA-99',
        title: 'New Task',
        description: 'Do the thing',
        status: 'TODO',
        priority: 'HIGH',
        projectId: 'proj-1',
      };

      await withMockBackend({ createTask: created }, async (received) => {
        const result = await callTool('create_task', {
          workspaceId: 'ws-1',
          title: 'New Task',
          description: 'Do the thing',
          status: 'TODO',
          priority: 'HIGH',
          projectId: 'proj-1',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.displayId).toBe('ORCA-99');
        expect(parsed.title).toBe('New Task');
        expect(parsed.priority).toBe('HIGH');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.input.workspaceId).toBe('ws-1');
        expect(sentVars.input.title).toBe('New Task');
        expect(sentVars.input.status).toBe('TODO');
        expect(sentVars.input.priority).toBe('HIGH');
        expect(sentVars.input.projectId).toBe('proj-1');
      });
    });

    it('creates task with only required fields', async () => {
      const created = {
        id: 'task-min',
        displayId: 'ORCA-100',
        title: 'Minimal Task',
        description: null,
        status: 'TODO',
        priority: 'NONE',
        projectId: null,
      };

      await withMockBackend({ createTask: created }, async (received) => {
        const result = await callTool('create_task', {
          workspaceId: 'ws-1',
          title: 'Minimal Task',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.displayId).toBe('ORCA-100');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.input.workspaceId).toBe('ws-1');
        expect(sentVars.input.title).toBe('Minimal Task');
      });
    });
  });

  describe('update_task', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('update_task', { id: 'task-1', title: 'Updated' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('updates task with all fields and returns result', async () => {
      const updated = {
        id: 'task-1',
        displayId: 'ORCA-42',
        title: 'Updated Title',
        description: 'New desc',
        status: 'IN_REVIEW',
        priority: 'HIGH',
        projectId: 'proj-2',
        assignee: { id: 'user-1', name: 'Alice' },
        labels: [{ id: 'label-1', name: 'Bug', color: '#ff0000' }],
      };

      await withMockBackend({ updateTask: updated }, async (received) => {
        const result = await callTool('update_task', {
          id: 'task-1',
          title: 'Updated Title',
          description: 'New desc',
          status: 'IN_REVIEW',
          priority: 'HIGH',
          projectId: 'proj-2',
          assigneeId: 'user-1',
          labelIds: ['label-1'],
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.title).toBe('Updated Title');
        expect(parsed.assignee.name).toBe('Alice');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('task-1');
        expect(sentVars.input.title).toBe('Updated Title');
        expect(sentVars.input.status).toBe('IN_REVIEW');
        expect(sentVars.input.assigneeId).toBe('user-1');
        expect(sentVars.input.labelIds).toEqual(['label-1']);
      });
    });

    it('sends only provided fields in input', async () => {
      const updated = {
        id: 'task-1',
        displayId: 'ORCA-42',
        title: 'New Title',
        description: null,
        status: 'TODO',
        priority: 'NONE',
        projectId: null,
        assignee: null,
        labels: [],
      };

      await withMockBackend({ updateTask: updated }, async (received) => {
        const result = await callTool('update_task', {
          id: 'task-1',
          title: 'New Title',
        });
        expect(result.isError).toBeUndefined();

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('task-1');
        expect(sentVars.input.title).toBe('New Title');
        expect(Object.keys(sentVars.input)).toEqual(['title']);
      });
    });

    it('sends null to clear projectId and assigneeId', async () => {
      const updated = {
        id: 'task-1',
        displayId: 'ORCA-42',
        title: 'Test',
        description: null,
        status: 'TODO',
        priority: 'NONE',
        projectId: null,
        assignee: null,
        labels: [],
      };

      await withMockBackend({ updateTask: updated }, async (received) => {
        const result = await callTool('update_task', {
          id: 'task-1',
          projectId: null,
          assigneeId: null,
        });
        expect(result.isError).toBeUndefined();

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('task-1');
        expect(sentVars.input.projectId).toBeNull();
        expect(sentVars.input.assigneeId).toBeNull();
      });
    });
  });

  describe('update_project', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('update_project', { id: 'proj-1', name: 'Updated' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('updates project and returns result', async () => {
      const updated = {
        id: 'proj-1',
        name: 'Updated Project',
        description: 'New desc',
        defaultDirectory: '/code',
        initiativeId: 'init-2',
      };

      await withMockBackend({ updateProject: updated }, async (received) => {
        const result = await callTool('update_project', {
          id: 'proj-1',
          name: 'Updated Project',
          description: 'New desc',
          defaultDirectory: '/code',
          initiativeId: 'init-2',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.name).toBe('Updated Project');
        expect(parsed.initiativeId).toBe('init-2');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('proj-1');
        expect(sentVars.input.name).toBe('Updated Project');
        expect(sentVars.input.defaultDirectory).toBe('/code');
      });
    });

    it('sends null to clear defaultDirectory and initiativeId', async () => {
      const updated = {
        id: 'proj-1',
        name: 'Test',
        description: null,
        defaultDirectory: null,
        initiativeId: null,
      };

      await withMockBackend({ updateProject: updated }, async (received) => {
        const result = await callTool('update_project', {
          id: 'proj-1',
          defaultDirectory: null,
          initiativeId: null,
        });
        expect(result.isError).toBeUndefined();

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('proj-1');
        expect(sentVars.input.defaultDirectory).toBeNull();
        expect(sentVars.input.initiativeId).toBeNull();
      });
    });
  });

  describe('update_initiative', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('update_initiative', { id: 'init-1', name: 'Updated' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('updates initiative and returns result', async () => {
      const updated = { id: 'init-1', name: 'Updated Initiative', description: 'New desc' };

      await withMockBackend({ updateInitiative: updated }, async (received) => {
        const result = await callTool('update_initiative', {
          id: 'init-1',
          name: 'Updated Initiative',
          description: 'New desc',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.name).toBe('Updated Initiative');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('init-1');
        expect(sentVars.input.name).toBe('Updated Initiative');
        expect(sentVars.input.description).toBe('New desc');
      });
    });
  });

  describe('delete_task', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('delete_task', { id: 'task-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('deletes task and returns result', async () => {
      const archived = { id: 'task-1', archivedAt: '2026-03-22T00:00:00.000Z' };

      await withMockBackend({ archiveTask: archived }, async (received) => {
        const result = await callTool('delete_task', { id: 'task-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe('task-1');
        expect(parsed.archivedAt).toBe('2026-03-22T00:00:00.000Z');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('task-1');
      });
    });

    it('returns error on GraphQL errors', async () => {
      await withMockBackend({ raw: { errors: [{ message: 'Not found' }] } }, async () => {
        const result = await callTool('delete_task', { id: 'task-1' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to delete task');
      });
    });
  });

  describe('delete_project', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('delete_project', { id: 'proj-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('deletes project and returns result', async () => {
      const archived = { id: 'proj-1', archivedAt: '2026-03-22T00:00:00.000Z' };

      await withMockBackend({ archiveProject: archived }, async (received) => {
        const result = await callTool('delete_project', { id: 'proj-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe('proj-1');
        expect(parsed.archivedAt).toBe('2026-03-22T00:00:00.000Z');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('proj-1');
      });
    });

    it('returns error on GraphQL errors', async () => {
      await withMockBackend({ raw: { errors: [{ message: 'Not found' }] } }, async () => {
        const result = await callTool('delete_project', { id: 'proj-1' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to delete project');
      });
    });
  });

  describe('delete_initiative', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('delete_initiative', { id: 'init-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('deletes initiative and returns result', async () => {
      const archived = { id: 'init-1', archivedAt: '2026-03-22T00:00:00.000Z' };

      await withMockBackend({ archiveInitiative: archived }, async (received) => {
        const result = await callTool('delete_initiative', { id: 'init-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe('init-1');
        expect(parsed.archivedAt).toBe('2026-03-22T00:00:00.000Z');

        const sentVars = JSON.parse(received.body()).variables;
        expect(sentVars.id).toBe('init-1');
      });
    });

    it('returns error on GraphQL errors', async () => {
      await withMockBackend({ raw: { errors: [{ message: 'Not found' }] } }, async () => {
        const result = await callTool('delete_initiative', { id: 'init-1' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to delete initiative');
      });
    });
  });

  // ── Query tools ─────────────────────────────────────────────────────

  describe('get_task', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('get_task', { id: 'task-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns error when neither id nor displayId provided', async () => {
      await withMockBackend({}, async () => {
        const result = await callTool('get_task', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Provide either id or displayId');
      });
    });

    it('returns error when displayId given without workspaceId', async () => {
      await withMockBackend({}, async () => {
        const result = await callTool('get_task', { displayId: 'ORCA-42' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('workspaceId is required');
      });
    });

    it('gets task by UUID', async () => {
      const mockTask = {
        id: 'task-1',
        displayId: 'ORCA-42',
        title: 'Test task',
        status: 'TODO',
        priority: 'NONE',
        project: null,
        assignee: null,
        labels: [],
        pullRequests: [],
        relationships: [],
      };

      await withMockBackend({ task: mockTask }, async () => {
        const result = await callTool('get_task', { id: 'task-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.displayId).toBe('ORCA-42');
      });
    });

    it('gets task by displayId with workspaceId', async () => {
      const mockTask = {
        id: 'task-1',
        displayId: 'ORCA-42',
        title: 'Test task',
        status: 'TODO',
      };

      await withMockBackend({ taskByDisplayId: mockTask }, async () => {
        const result = await callTool('get_task', {
          displayId: 'ORCA-42',
          workspaceId: 'ws-1',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.displayId).toBe('ORCA-42');
      });
    });
  });

  describe('get_project', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('get_project', { id: 'proj-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns project with tasks', async () => {
      const mockProject = {
        id: 'proj-1',
        name: 'Backend',
        description: null,
        defaultDirectory: '/code',
        workspaceId: 'ws-1',
        initiativeId: null,
        initiative: null,
        tasks: [
          { id: 'task-1', displayId: 'ORCA-1', title: 'Task 1', status: 'TODO' },
          { id: 'task-2', displayId: 'ORCA-2', title: 'Task 2', status: 'DONE' },
        ],
      };

      await withMockBackend({ project: mockProject }, async () => {
        const result = await callTool('get_project', { id: 'proj-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.name).toBe('Backend');
        expect(parsed.tasks).toHaveLength(2);
      });
    });
  });

  describe('get_initiative', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('get_initiative', { id: 'init-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns initiative with projects', async () => {
      const mockInitiative = {
        id: 'init-1',
        name: 'Phase 1',
        description: 'First phase',
        workspaceId: 'ws-1',
        projects: [{ id: 'proj-1', name: 'Backend', description: null }],
      };

      await withMockBackend({ initiative: mockInitiative }, async () => {
        const result = await callTool('get_initiative', { id: 'init-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.name).toBe('Phase 1');
        expect(parsed.projects).toHaveLength(1);
      });
    });
  });

  describe('list_tasks', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('list_tasks', { projectId: 'proj-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns error when neither projectId nor workspaceSlug provided', async () => {
      await withMockBackend({}, async () => {
        const result = await callTool('list_tasks', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Provide either projectId or workspaceSlug');
      });
    });

    it('returns tasks from a project', async () => {
      const mockTasks = [
        { id: 'task-1', displayId: 'ORCA-1', title: 'Task 1', status: 'TODO' },
        { id: 'task-2', displayId: 'ORCA-2', title: 'Task 2', status: 'DONE' },
      ];

      await withMockBackend({ project: { tasks: mockTasks } }, async () => {
        const result = await callTool('list_tasks', { projectId: 'proj-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
      });
    });

    it('returns tasks from a workspace', async () => {
      const mockTasks = [
        { id: 'task-1', displayId: 'ORCA-1', title: 'Task 1', status: 'IN_PROGRESS' },
      ];

      await withMockBackend({ workspace: { tasks: mockTasks } }, async () => {
        const result = await callTool('list_tasks', { workspaceSlug: 'my-ws' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(1);
      });
    });

    it('filters tasks by status', async () => {
      const mockTasks = [
        { id: 'task-1', displayId: 'ORCA-1', title: 'Task 1', status: 'TODO' },
        { id: 'task-2', displayId: 'ORCA-2', title: 'Task 2', status: 'DONE' },
        { id: 'task-3', displayId: 'ORCA-3', title: 'Task 3', status: 'TODO' },
      ];

      await withMockBackend({ project: { tasks: mockTasks } }, async () => {
        const result = await callTool('list_tasks', {
          projectId: 'proj-1',
          status: 'TODO',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
        expect(parsed.every((t: { status: string }) => t.status === 'TODO')).toBe(true);
      });
    });
  });

  describe('search_projects', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('search_projects', {
        workspaceSlug: 'my-ws',
        query: 'back',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns matching projects case-insensitively', async () => {
      const mockProjects = [
        { id: 'proj-1', name: 'Backend API' },
        { id: 'proj-2', name: 'Frontend App' },
        { id: 'proj-3', name: 'backend workers' },
      ];

      await withMockBackend({ workspace: { projects: mockProjects } }, async () => {
        const result = await callTool('search_projects', {
          workspaceSlug: 'my-ws',
          query: 'backend',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
      });
    });

    it('returns empty array when no match', async () => {
      const mockProjects = [{ id: 'proj-1', name: 'Backend API' }];

      await withMockBackend({ workspace: { projects: mockProjects } }, async () => {
        const result = await callTool('search_projects', {
          workspaceSlug: 'my-ws',
          query: 'zzz',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(0);
      });
    });
  });

  describe('search_tasks', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('search_tasks', {
        workspaceSlug: 'my-ws',
        query: 'fix',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns matching tasks case-insensitively', async () => {
      const mockTasks = [
        { id: 't-1', title: 'Fix login bug', status: 'TODO', projectId: 'proj-1' },
        { id: 't-2', title: 'Add feature', status: 'TODO', projectId: 'proj-1' },
        { id: 't-3', title: 'fix logout issue', status: 'DONE', projectId: 'proj-2' },
      ];

      await withMockBackend({ workspace: { tasks: mockTasks } }, async () => {
        const result = await callTool('search_tasks', {
          workspaceSlug: 'my-ws',
          query: 'fix',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
      });
    });

    it('filters by projectId and status', async () => {
      const mockTasks = [
        { id: 't-1', title: 'Fix login bug', status: 'TODO', projectId: 'proj-1' },
        { id: 't-2', title: 'Fix signup bug', status: 'DONE', projectId: 'proj-1' },
        { id: 't-3', title: 'Fix logout issue', status: 'TODO', projectId: 'proj-2' },
      ];

      await withMockBackend({ workspace: { tasks: mockTasks } }, async () => {
        const result = await callTool('search_tasks', {
          workspaceSlug: 'my-ws',
          query: 'fix',
          projectId: 'proj-1',
          status: 'TODO',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].id).toBe('t-1');
      });
    });
  });

  describe('search_initiatives', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('search_initiatives', {
        workspaceSlug: 'my-ws',
        query: 'phase',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns matching initiatives case-insensitively', async () => {
      const mockInitiatives = [
        { id: 'init-1', name: 'Phase 1' },
        { id: 'init-2', name: 'Phase 2' },
        { id: 'init-3', name: 'MVP Launch' },
      ];

      await withMockBackend({ workspace: { initiatives: mockInitiatives } }, async () => {
        const result = await callTool('search_initiatives', {
          workspaceSlug: 'my-ws',
          query: 'phase',
        });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
      });
    });
  });

  describe('list_labels', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('list_labels', { workspaceId: 'ws-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns labels from backend', async () => {
      const mockLabels = [
        { id: 'label-1', name: 'Bug', color: '#ff0000', workspaceId: 'ws-1' },
        { id: 'label-2', name: 'Feature', color: '#00ff00', workspaceId: 'ws-1' },
      ];

      await withMockBackend({ labels: mockLabels }, async () => {
        const result = await callTool('list_labels', { workspaceId: 'ws-1' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].name).toBe('Bug');
      });
    });
  });

  describe('list_workspace_members', () => {
    it('returns error when no token', async () => {
      deps.getToken = () => null;
      const result = await callTool('list_workspace_members', { workspaceSlug: 'my-ws' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authenticated');
    });

    it('returns members from backend', async () => {
      const mockMembers = [
        { id: 'mem-1', user: { id: 'u-1', name: 'Alice', email: 'alice@test.com' }, role: 'OWNER' },
        { id: 'mem-2', user: { id: 'u-2', name: 'Bob', email: 'bob@test.com' }, role: 'MEMBER' },
      ];

      await withMockBackend({ workspace: { members: mockMembers } }, async () => {
        const result = await callTool('list_workspace_members', { workspaceSlug: 'my-ws' });
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].user.name).toBe('Alice');
        expect(parsed[1].role).toBe('MEMBER');
      });
    });
  });
});
