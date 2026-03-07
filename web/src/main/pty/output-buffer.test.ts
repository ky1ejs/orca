import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  getDb: () => testDb,
}));

const { appendOutput, replayOutput, clearOutput } = await import('./output-buffer.js');

function createTestSession(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO terminal_session (id, status, created_at) VALUES (?, 'RUNNING', datetime('now'))`,
  ).run(id);
}

describe('output-buffer', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    runMigrations(testDb);
  });

  afterEach(() => {
    testDb.close();
  });

  it('appends and replays output', () => {
    createTestSession(testDb, 'session-1');
    appendOutput('session-1', 'hello ');
    appendOutput('session-1', 'world');

    const result = replayOutput('session-1');
    expect(result).toBe('hello world');
  });

  it('replays output in correct sequence order', () => {
    createTestSession(testDb, 'session-1');
    appendOutput('session-1', 'first\n');
    appendOutput('session-1', 'second\n');
    appendOutput('session-1', 'third\n');

    const result = replayOutput('session-1');
    expect(result).toBe('first\nsecond\nthird\n');
  });

  it('returns empty string for session with no output', () => {
    createTestSession(testDb, 'session-1');
    const result = replayOutput('session-1');
    expect(result).toBe('');
  });

  it('clears output for a session', () => {
    createTestSession(testDb, 'session-1');
    appendOutput('session-1', 'some data');
    clearOutput('session-1');

    const result = replayOutput('session-1');
    expect(result).toBe('');
  });

  it('maintains independence between sessions', () => {
    createTestSession(testDb, 'session-a');
    createTestSession(testDb, 'session-b');

    appendOutput('session-a', 'data-a');
    appendOutput('session-b', 'data-b');

    expect(replayOutput('session-a')).toBe('data-a');
    expect(replayOutput('session-b')).toBe('data-b');

    clearOutput('session-a');
    expect(replayOutput('session-a')).toBe('');
    expect(replayOutput('session-b')).toBe('data-b');
  });

  it('evicts oldest chunks when buffer exceeds 1MB', () => {
    createTestSession(testDb, 'session-1');

    // Write ~1.1MB in 11 chunks of ~100KB each
    const chunkSize = 100 * 1024;
    const chunkData = 'x'.repeat(chunkSize);
    for (let i = 0; i < 11; i++) {
      appendOutput('session-1', chunkData);
    }

    // After eviction, the total size should be less than 1MB
    const result = replayOutput('session-1');
    expect(result.length).toBeLessThan(1024 * 1024);

    // Some chunks should have been evicted (oldest 25% = ~2-3 of 11)
    const rowCount = testDb
      .prepare('SELECT COUNT(*) as cnt FROM terminal_output_buffer WHERE session_id = ?')
      .get('session-1') as { cnt: number };
    expect(rowCount.cnt).toBeLessThan(11);
  });
});
