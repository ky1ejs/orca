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

const { PtyManager } = await import('./manager.js');

function createTestSession(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO terminal_session (id, status, created_at) VALUES (?, 'STARTING', datetime('now'))`,
  ).run(id);
}

describe('PtyManager', () => {
  let manager: InstanceType<typeof PtyManager>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    testDb = createDb(sqlite, migrationsFolder);
    manager = new PtyManager();
  });

  afterEach(() => {
    manager.killAll();
    sqlite.close();
  });

  it('spawns a process and captures output via replay', async () => {
    createTestSession(sqlite, 'test-session');
    manager.spawn('test-session', '/bin/echo', ['hello'], '/tmp');

    // Wait for the process to complete and output to be captured
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const session = sqlite
          .prepare('SELECT status FROM terminal_session WHERE id = ?')
          .get('test-session') as { status: string } | undefined;
        if (
          session &&
          session.status !== SessionStatus.Running &&
          session.status !== SessionStatus.Starting
        ) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
      // Safety timeout
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 5000);
    });

    const output = manager.replay('test-session');
    expect(output).toContain('hello');

    // Session should be marked as EXITED
    const session = sqlite
      .prepare('SELECT status, pid FROM terminal_session WHERE id = ?')
      .get('test-session') as { status: string; pid: number };
    expect(session.status).toBe(SessionStatus.Exited);
    expect(session.pid).toBeGreaterThan(0);
  });

  it('kills a running process', async () => {
    createTestSession(sqlite, 'kill-session');
    // Spawn a long-running process
    manager.spawn('kill-session', '/bin/cat', [], '/tmp');

    // Wait briefly for the process to start
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify it is running
    const sessionBefore = sqlite
      .prepare('SELECT status FROM terminal_session WHERE id = ?')
      .get('kill-session') as { status: string };
    expect(sessionBefore.status).toBe(SessionStatus.Running);

    manager.kill('kill-session');

    // Wait for exit to propagate
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const session = sqlite
          .prepare('SELECT status FROM terminal_session WHERE id = ?')
          .get('kill-session') as { status: string } | undefined;
        if (
          session &&
          session.status !== SessionStatus.Running &&
          session.status !== SessionStatus.Starting
        ) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 5000);
    });

    const sessionAfter = sqlite
      .prepare('SELECT status FROM terminal_session WHERE id = ?')
      .get('kill-session') as { status: string };
    // Kill sends SIGHUP which is non-zero exit
    expect([SessionStatus.Error, SessionStatus.Exited]).toContain(sessionAfter.status);
  });

  it('resizes without throwing', () => {
    createTestSession(sqlite, 'resize-session');
    manager.spawn('resize-session', '/bin/cat', [], '/tmp');

    expect(() => manager.resize('resize-session', 120, 40)).not.toThrow();

    manager.kill('resize-session');
  });

  it('writes data to a process', async () => {
    createTestSession(sqlite, 'write-session');
    manager.spawn('write-session', '/bin/cat', [], '/tmp');

    // Wait for process to start
    await new Promise((resolve) => setTimeout(resolve, 200));

    manager.write('write-session', 'test input\n');

    // Wait for the echo back
    await new Promise((resolve) => setTimeout(resolve, 300));

    const output = manager.replay('write-session');
    expect(output).toContain('test input');

    manager.kill('write-session');
  });

  it('killAll terminates all processes', () => {
    createTestSession(sqlite, 'ka-1');
    createTestSession(sqlite, 'ka-2');

    manager.spawn('ka-1', '/bin/cat', [], '/tmp');
    manager.spawn('ka-2', '/bin/cat', [], '/tmp');

    expect(() => manager.killAll()).not.toThrow();
  });

  it('handles resize on non-existent session gracefully', () => {
    expect(() => manager.resize('nonexistent', 80, 24)).not.toThrow();
  });

  it('handles write on non-existent session gracefully', () => {
    expect(() => manager.write('nonexistent', 'data')).not.toThrow();
  });

  it('handles kill on non-existent session gracefully', () => {
    expect(() => manager.kill('nonexistent')).not.toThrow();
  });

  it('killAll sends SIGTERM to all managed processes', async () => {
    createTestSession(sqlite, 'term-1');
    createTestSession(sqlite, 'term-2');

    // Spawn long-running processes
    manager.spawn('term-1', '/bin/cat', [], '/tmp');
    manager.spawn('term-2', '/bin/cat', [], '/tmp');

    // Wait for processes to start
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get the PIDs before killing
    const pids = manager.getManagedPids();
    expect(pids.size).toBe(2);

    // killAll should not throw and should terminate all processes
    expect(() => manager.killAll()).not.toThrow();

    // After killAll, managed PIDs should be empty
    expect(manager.getManagedPids().size).toBe(0);
  });

  it('getManagedPids returns current process map', () => {
    createTestSession(sqlite, 'pid-test');
    manager.spawn('pid-test', '/bin/cat', [], '/tmp');

    const pids = manager.getManagedPids();
    expect(pids.size).toBe(1);
    expect(pids.has('pid-test')).toBe(true);
    const pid = pids.get('pid-test');
    expect(pid).toBeGreaterThan(0);

    manager.kill('pid-test');
  });
});
