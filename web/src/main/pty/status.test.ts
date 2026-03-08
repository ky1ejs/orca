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

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

vi.mock('./auth.js', () => ({
  readToken: () => 'test-token',
  storeToken: () => {},
  clearToken: () => {},
}));

const { PtyManager } = await import('./manager.js');
const { StatusManager } = await import('./status.js');

describe('StatusManager', () => {
  let ptyManager: InstanceType<typeof PtyManager>;
  let statusManager: InstanceType<typeof StatusManager>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    testDb = createDb(sqlite, migrationsFolder);
    ptyManager = new PtyManager();
    statusManager = new StatusManager(ptyManager, { backendUrl: 'http://localhost:4000' });
    mockFetch.mockClear();
  });

  afterEach(() => {
    statusManager.dispose();
    ptyManager.killAll();
    sqlite.close();
  });

  it('launch creates session and spawns process', async () => {
    const result = await statusManager.launch('task-1', '/tmp');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sessionId).toBeTruthy();

      // Session should exist in DB
      const session = sqlite
        .prepare('SELECT * FROM terminal_session WHERE id = ?')
        .get(result.sessionId) as { status: string; task_id: string };
      expect(session).toBeTruthy();
      expect(session.task_id).toBe('task-1');
    }

    // Should have called GraphQL to update task status
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('launch fails with invalid working directory', async () => {
    const result = await statusManager.launch('task-1', '/nonexistent/path/xyz');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('InvalidWorkingDirectoryError');
      expect(result.error.suggestion).toBeTruthy();
    }
  });

  it('stop kills the PTY and stops monitoring', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (result.success) {
      statusManager.stop(result.sessionId);

      // Wait for exit to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  });

  it('getStatus returns session status', async () => {
    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);
    if (result.success) {
      const status = statusManager.getStatus(result.sessionId);
      expect(status).toBeTruthy();
      expect([SessionStatus.Starting, SessionStatus.Running]).toContain(status);
    }
  });

  it('getStatus returns null for non-existent session', () => {
    const status = statusManager.getStatus('nonexistent');
    expect(status).toBeNull();
  });

  it('dispose clears all monitors', async () => {
    await statusManager.launch('task-1', '/tmp');
    expect(() => statusManager.dispose()).not.toThrow();
  });

  it('launch with planMode spawns claude instead of shell', async () => {
    const spawnSpy = vi.spyOn(ptyManager, 'spawn');

    const result = await statusManager.launch('task-1', '/tmp', { planMode: true });
    expect(result.success).toBe(true);

    expect(spawnSpy).toHaveBeenCalledWith(
      expect.any(String),
      '/usr/local/bin/claude',
      ['--permission-mode', 'plan'],
      '/tmp',
    );

    spawnSpy.mockRestore();
  });

  it('launch with planMode fails when claude not found', async () => {
    mockFindClaudePath.mockReturnValueOnce(null);

    const result = await statusManager.launch('task-1', '/tmp', { planMode: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('ClaudeNotFoundError');
    }
  });

  it('launch without planMode spawns default shell', async () => {
    const spawnSpy = vi.spyOn(ptyManager, 'spawn');

    const result = await statusManager.launch('task-1', '/tmp');
    expect(result.success).toBe(true);

    expect(spawnSpy).toHaveBeenCalledWith(expect.any(String), '/bin/echo', [], '/tmp');

    spawnSpy.mockRestore();
  });
});
