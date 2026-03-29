import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { initDaemonDb, closeDaemonDb, getDb } from './db.js';
import { DaemonPtyManager } from './pty-manager.js';
import { OutputPersistence } from './output-persistence.js';
import { createSession, deleteSession } from './sessions.js';
import { terminalOutputBuffer } from '../shared/db/schema.js';
import { eq } from 'drizzle-orm';
import { SessionStatus } from '../shared/session-status.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

let tempDir: string;
let ptyManager: DaemonPtyManager;
let persistence: OutputPersistence;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'output-persistence-'));
  const dbPath = join(tempDir, 'test.db');
  initDaemonDb(dbPath, migrationsFolder);

  ptyManager = new DaemonPtyManager(() => {});
});

afterEach(() => {
  persistence?.dispose();
  ptyManager.killAll();
  closeDaemonDb();
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function createTestSession(): string {
  const session = createSession({ status: SessionStatus.Running });
  return session.id;
}

function getPersistedChunks(sessionId: string) {
  const db = getDb();
  return db
    .select()
    .from(terminalOutputBuffer)
    .where(eq(terminalOutputBuffer.session_id, sessionId))
    .all();
}

describe('OutputPersistence', () => {
  it('flush persists dirty buffers to SQLite', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'hello world');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flush();

    const rows = getPersistedChunks(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].sequence).toBe(0);
    expect(rows[0].chunk.toString()).toBe('hello world');
  });

  it('flush only writes dirty sessions', () => {
    const dirtyId = createTestSession();
    const cleanId = createTestSession();
    ptyManager.restoreBuffer(dirtyId, 'dirty data');
    ptyManager.restoreBuffer(cleanId, 'clean data');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(dirtyId);
    persistence.flush();

    expect(getPersistedChunks(dirtyId)).toHaveLength(1);
    expect(getPersistedChunks(cleanId)).toHaveLength(0);
  });

  it('flush clears dirty set after writing', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'data');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flush();

    // Second flush should be a no-op (nothing dirty)
    const db = getDb();
    db.delete(terminalOutputBuffer).where(eq(terminalOutputBuffer.session_id, sessionId)).run();

    persistence.flush();
    expect(getPersistedChunks(sessionId)).toHaveLength(0);
  });

  it('flush replaces previous data on re-flush', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'first');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flush();

    // Simulate new data by restoring a new buffer
    ptyManager.restoreBuffer(sessionId, 'second');
    persistence.markDirty(sessionId);
    persistence.flush();

    const rows = getPersistedChunks(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].chunk.toString()).toBe('second');
  });

  it('flushSession persists a single session immediately', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'exit data');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flushSession(sessionId);

    const rows = getPersistedChunks(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].chunk.toString()).toBe('exit data');
  });

  it('flushSession removes session from dirty set', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'data');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flushSession(sessionId);

    // Clear persisted data to verify flush() doesn't re-write it
    const db = getDb();
    db.delete(terminalOutputBuffer).where(eq(terminalOutputBuffer.session_id, sessionId)).run();

    persistence.flush();
    expect(getPersistedChunks(sessionId)).toHaveLength(0);
  });

  it('loadAll restores buffers from SQLite', () => {
    const sessionId = createTestSession();

    // Manually insert persisted output
    const db = getDb();
    db.insert(terminalOutputBuffer)
      .values({
        session_id: sessionId,
        chunk: Buffer.from('restored content'),
        sequence: 0,
      })
      .run();

    persistence = new OutputPersistence(ptyManager);
    persistence.loadAll();

    expect(ptyManager.replay(sessionId)).toBe('restored content');
  });

  it('loadAll concatenates multiple chunks in sequence order', () => {
    const sessionId = createTestSession();

    const db = getDb();
    db.insert(terminalOutputBuffer)
      .values([
        { session_id: sessionId, chunk: Buffer.from('first '), sequence: 0 },
        { session_id: sessionId, chunk: Buffer.from('second'), sequence: 1 },
      ])
      .run();

    persistence = new OutputPersistence(ptyManager);
    persistence.loadAll();

    expect(ptyManager.replay(sessionId)).toBe('first second');
  });

  it('dispose stops timer and does final flush', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'final data');

    persistence = new OutputPersistence(ptyManager);
    persistence.start();
    persistence.markDirty(sessionId);
    persistence.dispose();

    const rows = getPersistedChunks(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].chunk.toString()).toBe('final data');
  });

  it('flush handles empty buffer gracefully (deletes rows)', () => {
    const sessionId = createTestSession();

    // Pre-populate SQLite
    const db = getDb();
    db.insert(terminalOutputBuffer)
      .values({
        session_id: sessionId,
        chunk: Buffer.from('old data'),
        sequence: 0,
      })
      .run();

    // Restore an empty buffer (simulating clear)
    ptyManager.restoreBuffer(sessionId, '');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flush();

    expect(getPersistedChunks(sessionId)).toHaveLength(0);
  });

  it('flush handles non-existent buffer gracefully', () => {
    const sessionId = createTestSession();

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);

    // No buffer exists for this session — replay returns ''
    expect(() => persistence.flush()).not.toThrow();
    expect(getPersistedChunks(sessionId)).toHaveLength(0);
  });

  it('periodic timer triggers flush', async () => {
    vi.useFakeTimers();

    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'timer data');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.start();

    vi.advanceTimersByTime(5_000);

    const rows = getPersistedChunks(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].chunk.toString()).toBe('timer data');

    vi.useRealTimers();
  });

  it('flush persists snapshot over ring buffer replay when available', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'raw chunks');
    ptyManager.setSnapshot(sessionId, 'serialized state');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flush();

    const rows = getPersistedChunks(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].chunk.toString()).toBe('serialized state');
  });

  it('flush falls back to ring buffer when no snapshot exists', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'raw chunks only');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.flush();

    const rows = getPersistedChunks(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].chunk.toString()).toBe('raw chunks only');
  });

  it('setSnapshot triggers dirty marking via onData callback', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, '');
    const dirtySpy = vi.fn();
    ptyManager.setOnData(dirtySpy);

    ptyManager.setSnapshot(sessionId, 'snapshot content');

    expect(dirtySpy).toHaveBeenCalledWith(sessionId);
  });

  it('setSnapshot is ignored for killed sessions (no buffer)', () => {
    const sessionId = createTestSession();
    // No restoreBuffer — simulates a session that was killed
    const dirtySpy = vi.fn();
    ptyManager.setOnData(dirtySpy);

    ptyManager.setSnapshot(sessionId, 'late snapshot');

    expect(dirtySpy).not.toHaveBeenCalled();
    expect(ptyManager.getSnapshot(sessionId)).toBeUndefined();
  });

  it('removeSession prevents flush from persisting a deleted session', () => {
    const sessionId = createTestSession();
    ptyManager.restoreBuffer(sessionId, 'doomed data');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(sessionId);
    persistence.removeSession(sessionId);
    deleteSession(sessionId);

    // flush should not throw (session row is gone)
    expect(() => persistence.flush()).not.toThrow();
  });

  it('flush survives when a dirty session has been deleted from DB', () => {
    const keptId = createTestSession();
    const deletedId = createTestSession();
    ptyManager.restoreBuffer(keptId, 'keep me');
    ptyManager.restoreBuffer(deletedId, 'delete me');

    persistence = new OutputPersistence(ptyManager);
    persistence.markDirty(keptId);
    persistence.markDirty(deletedId);

    // Delete session row (cascades output buffer) without calling removeSession
    deleteSession(deletedId);

    // flush should not throw — the FK error for deletedId is caught
    expect(() => persistence.flush()).not.toThrow();

    // The surviving session should still be persisted
    expect(getPersistedChunks(keptId)).toHaveLength(1);
    expect(getPersistedChunks(keptId)[0].chunk.toString()).toBe('keep me');
  });
});
