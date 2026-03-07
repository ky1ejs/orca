import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  getDb: () => testDb,
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

vi.mock('./auth.js', () => ({
  readAuthToken: () => 'test-token',
}));

const { PtyManager } = await import('./manager.js');
const { StatusManager } = await import('./status.js');

describe('StatusManager', () => {
  let ptyManager: InstanceType<typeof PtyManager>;
  let statusManager: InstanceType<typeof StatusManager>;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    runMigrations(testDb);
    ptyManager = new PtyManager();
    statusManager = new StatusManager(ptyManager, 4000);
    mockFetch.mockClear();
  });

  afterEach(() => {
    statusManager.dispose();
    ptyManager.killAll();
    testDb.close();
  });

  it('launch creates session and spawns process', async () => {
    const result = await statusManager.launch('task-1', '/tmp');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sessionId).toBeTruthy();

      // Session should exist in DB
      const session = testDb
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
      // Should not throw
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
      expect(['STARTING', 'RUNNING']).toContain(status);
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
});
