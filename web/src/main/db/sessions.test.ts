import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { createDb, type OrcaDb } from './client.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

let testDb: OrcaDb;
let sqlite: Database.Database;

vi.mock('./client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./client.js')>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

// Import after mock
const { getSessions, getSession, createSession, updateSession, sweepStaleSessions } =
  await import('./sessions.js');

describe('sessions', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    testDb = createDb(sqlite, migrationsFolder);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('creates and retrieves a session', () => {
    const session = createSession({ status: 'RUNNING', workingDirectory: '/tmp' });
    expect(session.id).toBeDefined();
    expect(session.status).toBe('RUNNING');
    expect(session.working_directory).toBe('/tmp');

    const retrieved = getSession(session.id);
    expect(retrieved).toEqual(session);
  });

  it('lists all sessions', () => {
    createSession({ status: 'RUNNING' });
    createSession({ status: 'STARTING' });

    const sessions = getSessions();
    expect(sessions).toHaveLength(2);
  });

  it('updates a session', () => {
    const session = createSession({ status: 'STARTING' });
    const updated = updateSession(session.id, { status: 'RUNNING', pid: 1234 });

    expect(updated?.status).toBe('RUNNING');
    expect(updated?.pid).toBe(1234);
  });

  it('returns undefined for non-existent session', () => {
    const result = getSession('nonexistent');
    expect(result).toBeUndefined();
  });

  describe('sweepStaleSessions', () => {
    it('marks sessions with dead PIDs as ERROR and returns sweep result', () => {
      // Create a session with a PID that doesn't exist
      const session = createSession({ status: 'RUNNING', pid: 999999 });

      // Mock process.kill to throw (pid doesn't exist)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const result = sweepStaleSessions();

      expect(result.total).toBe(1);
      expect(result.sweptIds).toContain(session.id);

      const updated = getSession(session.id);
      expect(updated?.status).toBe('ERROR');
      expect(updated?.stopped_at).toBeDefined();

      killSpy.mockRestore();
    });

    it('leaves sessions with alive PIDs as is', () => {
      const session = createSession({ status: 'RUNNING', pid: process.pid });

      // process.kill(process.pid, 0) should succeed (our own PID)
      const result = sweepStaleSessions();

      expect(result.total).toBe(0);
      expect(result.sweptIds).toEqual([]);

      const updated = getSession(session.id);
      expect(updated?.status).toBe('RUNNING');
    });

    it('sweeps multiple stale sessions at startup', () => {
      // Simulate multiple sessions left over from a previous run
      const s1 = createSession({ status: 'RUNNING', pid: 999991 });
      const s2 = createSession({ status: 'STARTING', pid: 999992 });
      const s3 = createSession({ status: 'RUNNING', pid: process.pid }); // alive

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((_pid, _signal) => {
        const pid = _pid as number;
        if (pid === process.pid) return true;
        throw new Error('ESRCH');
      });

      const result = sweepStaleSessions();

      expect(result.total).toBe(2);
      expect(result.sweptIds).toContain(s1.id);
      expect(result.sweptIds).toContain(s2.id);
      expect(result.sweptIds).not.toContain(s3.id);

      expect(getSession(s1.id)?.status).toBe('ERROR');
      expect(getSession(s2.id)?.status).toBe('ERROR');
      expect(getSession(s3.id)?.status).toBe('RUNNING');

      killSpy.mockRestore();
    });
  });
});
