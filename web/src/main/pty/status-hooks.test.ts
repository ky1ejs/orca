import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { createDb, type OrcaDb } from '../db/client.js';
import { SessionStatus } from '../../shared/session-status.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

let testDb: OrcaDb;
let sqlite: Database.Database;

vi.mock('../db/client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../db/client.js')>();
  return {
    ...original,
    getDb: () => testDb,
    getRawDb: () => sqlite,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('./shell.js', () => ({
  getDefaultShell: () => '/bin/echo',
  getLoginShellArgs: () => [],
}));

const mockFindClaudePath = vi.fn((): string | null => '/usr/local/bin/claude');
vi.mock('./claude.js', () => ({
  findClaudePath: mockFindClaudePath,
}));

// Save the real fetch before mocking, so we can use it for real HTTP calls
const realFetch = globalThis.fetch;

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

vi.mock('./auth.js', () => ({
  readToken: () => 'test-token',
  storeToken: () => {},
  clearToken: () => {},
}));

vi.mock('../hooks/settings.js', () => ({
  ensureHooks: vi.fn(),
  removeHooks: vi.fn(),
}));

const { HookServer } = await import('../hooks/server.js');
const { PtyManager } = await import('./manager.js');
const { StatusManager } = await import('./status.js');
const { updateSession } = await import('../db/sessions.js');

async function sendHookEvent(
  port: number,
  sessionId: string,
  eventName: string,
): Promise<Response> {
  return realFetch(`http://127.0.0.1:${port}/orca-hooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Orca-Session-Id': sessionId,
    },
    body: JSON.stringify({ hook_event_name: eventName }),
  });
}

function getSessionStatus(id: string): string | undefined {
  const row = sqlite.prepare('SELECT status FROM terminal_session WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  return row?.status;
}

describe('StatusManager + HookServer Integration', () => {
  let hookServer: InstanceType<typeof HookServer>;
  let ptyManager: InstanceType<typeof PtyManager>;
  let statusManager: InstanceType<typeof StatusManager>;
  let port: number;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    testDb = createDb(sqlite, migrationsFolder);

    hookServer = new HookServer();
    await hookServer.start();
    port = hookServer.getPort()!;

    ptyManager = new PtyManager();
    // Mock spawn to be a no-op but update session status to RUNNING (like real spawn does)
    vi.spyOn(ptyManager, 'spawn').mockImplementation((sessionId: string) => {
      updateSession(sessionId, { pid: 999, status: SessionStatus.Running });
    });
    vi.spyOn(ptyManager, 'replay').mockReturnValue('');
    vi.spyOn(ptyManager, 'kill').mockImplementation(() => {});

    statusManager = new StatusManager(ptyManager, hookServer, {
      backendUrl: 'http://localhost:4000',
      hookServerPort: port,
    });

    mockFetch.mockClear();
  });

  afterEach(async () => {
    statusManager.dispose();
    ptyManager.killAll();
    sqlite.close();
    await hookServer.stop();
  });

  it('Stop hook event sets status to WAITING_FOR_INPUT after debounce', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const res = await sendHookEvent(port, result.sessionId, 'Stop');
    expect(res.status).toBe(200);

    // Wait for event propagation + 200ms debounce
    await new Promise((r) => setTimeout(r, 350));

    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.WaitingForInput);
  });

  it('PermissionRequest hook event sets status to AWAITING_PERMISSION immediately', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const res = await sendHookEvent(port, result.sessionId, 'PermissionRequest');
    expect(res.status).toBe(200);

    // Small delay for event propagation (no debounce for PermissionRequest)
    await new Promise((r) => setTimeout(r, 50));

    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.AwaitingPermission);
  });

  it('UserPromptSubmit hook event sets status to RUNNING', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Manually set status to WAITING_FOR_INPUT
    sqlite
      .prepare('UPDATE terminal_session SET status = ? WHERE id = ?')
      .run(SessionStatus.WaitingForInput, result.sessionId);
    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.WaitingForInput);

    const res = await sendHookEvent(port, result.sessionId, 'UserPromptSubmit');
    expect(res.status).toBe(200);

    // Small delay for event propagation
    await new Promise((r) => setTimeout(r, 50));

    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.Running);
  });

  it('Stop debounce is cancelled by UserPromptSubmit', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Send Stop, then immediately UserPromptSubmit before debounce fires
    await sendHookEvent(port, result.sessionId, 'Stop');
    // Small delay for Stop event propagation
    await new Promise((r) => setTimeout(r, 20));
    await sendHookEvent(port, result.sessionId, 'UserPromptSubmit');

    // Wait past the debounce window
    await new Promise((r) => setTimeout(r, 350));

    // Status should be RUNNING, not WAITING_FOR_INPUT
    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.Running);
  });

  it('Stop debounce is cancelled by PermissionRequest', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Send Stop, then immediately PermissionRequest before debounce fires
    await sendHookEvent(port, result.sessionId, 'Stop');
    // Small delay for Stop event propagation
    await new Promise((r) => setTimeout(r, 20));
    await sendHookEvent(port, result.sessionId, 'PermissionRequest');

    // Wait past the debounce window
    await new Promise((r) => setTimeout(r, 350));

    // Status should be AWAITING_PERMISSION, not WAITING_FOR_INPUT
    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.AwaitingPermission);
  });

  it('hook events for unknown session are ignored', async () => {
    const res = await sendHookEvent(port, 'nonexistent-session', 'Stop');
    expect(res.status).toBe(200);

    // Wait for event propagation + debounce
    await new Promise((r) => setTimeout(r, 350));

    // No session should exist with that ID
    const row = sqlite
      .prepare('SELECT * FROM terminal_session WHERE id = ?')
      .get('nonexistent-session');
    expect(row).toBeUndefined();
  });

  it('first hook event disables InputDetector (hooks take over)', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Configure replay to return a pattern that would trigger InputDetector
    vi.mocked(ptyManager.replay).mockReturnValue('What do you want to do? ');

    // Send a hook event to activate hooks mode
    await sendHookEvent(port, result.sessionId, 'UserPromptSubmit');
    await new Promise((r) => setTimeout(r, 50));

    // Status should be RUNNING after UserPromptSubmit
    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.Running);

    // Wait for the monitoring interval (500ms) to tick and try to feed InputDetector
    // plus InputDetector's own debounce (500ms)
    await new Promise((r) => setTimeout(r, 1200));

    // Even though replay returns a "? " pattern, the InputDetector should NOT
    // have changed status to WAITING_FOR_INPUT because hooks are active
    expect(getSessionStatus(result.sessionId)).toBe(SessionStatus.Running);
  });
});
