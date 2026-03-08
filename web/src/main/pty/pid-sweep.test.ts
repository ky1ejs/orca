import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { createDb, type OrcaDb } from '../db/client.js';

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

const { PidSweepManager } = await import('./pid-sweep.js');
const { createSession, getSession, updateSession } = await import('../db/sessions.js');

describe('PidSweepManager', () => {
  let sweepManager: InstanceType<typeof PidSweepManager>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    testDb = createDb(sqlite, migrationsFolder);
    sweepManager = new PidSweepManager();
  });

  afterEach(() => {
    sweepManager.stop();
    sqlite.close();
  });

  it('detects dead PID and updates session to ERROR', () => {
    // Create a session with a PID that does not exist
    const session = createSession({ status: 'RUNNING' });
    updateSession(session.id, { pid: 999999 });

    // Mock process.kill to throw for the dead PID
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const deadIds = sweepManager.sweep();

    expect(deadIds).toContain(session.id);

    const updated = getSession(session.id);
    expect(updated?.status).toBe('ERROR');
    expect(updated?.stopped_at).toBeDefined();

    killSpy.mockRestore();
  });

  it('leaves alive PIDs untouched', () => {
    // Create a session with our own PID (which is alive)
    const session = createSession({ status: 'RUNNING' });
    updateSession(session.id, { pid: process.pid });

    const deadIds = sweepManager.sweep();

    expect(deadIds).not.toContain(session.id);

    const updated = getSession(session.id);
    expect(updated?.status).toBe('RUNNING');
  });

  it('sweeps WAITING_FOR_INPUT sessions with dead PIDs', () => {
    const session = createSession({ status: 'WAITING_FOR_INPUT' });
    updateSession(session.id, { pid: 999999 });

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const deadIds = sweepManager.sweep();

    expect(deadIds).toContain(session.id);

    const updated = getSession(session.id);
    expect(updated?.status).toBe('ERROR');

    killSpy.mockRestore();
  });

  it('returns empty array when no sessions are dead', () => {
    const session = createSession({ status: 'RUNNING' });
    updateSession(session.id, { pid: process.pid });

    const deadIds = sweepManager.sweep();
    expect(deadIds).toEqual([]);
  });

  it('handles sessions without PIDs (skips them)', () => {
    // Session without a PID should not be swept
    createSession({ status: 'RUNNING' });

    const deadIds = sweepManager.sweep();
    expect(deadIds).toEqual([]);
  });

  it('start and stop control the interval', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    sweepManager.start();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);

    sweepManager.stop();
    expect(clearIntervalSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('start is idempotent (does not create multiple intervals)', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    sweepManager.start();
    sweepManager.start();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });
});
