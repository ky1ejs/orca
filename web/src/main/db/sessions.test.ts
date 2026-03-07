import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

// We need to mock getDb before importing sessions
let testDb: Database.Database;

vi.mock('./client.js', () => ({
  getDb: () => testDb,
}));

// Import after mock
const { getSessions, getSession, createSession, updateSession, sweepStaleSessions } =
  await import('./sessions.js');

describe('sessions', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    runMigrations(testDb);
  });

  afterEach(() => {
    testDb.close();
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
    it('marks sessions with dead PIDs as ERROR', () => {
      // Create a session with a PID that doesn't exist
      const session = createSession({ status: 'RUNNING', pid: 999999 });

      // Mock process.kill to throw (pid doesn't exist)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      sweepStaleSessions();

      const updated = getSession(session.id);
      expect(updated?.status).toBe('ERROR');
      expect(updated?.stopped_at).toBeDefined();

      killSpy.mockRestore();
    });

    it('leaves sessions with alive PIDs as is', () => {
      const session = createSession({ status: 'RUNNING', pid: process.pid });

      // process.kill(process.pid, 0) should succeed (our own PID)
      sweepStaleSessions();

      const updated = getSession(session.id);
      expect(updated?.status).toBe('RUNNING');
    });
  });
});
