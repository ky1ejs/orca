import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Unit tests for the visible-size tracking in output-buffer.
 *
 * The output buffer stores chunks in SQLite, which makes full integration tests
 * heavy.  Instead we test the *visible size* logic by mocking `getRawDb` with a
 * lightweight in-memory database that has just the tables we need.
 */

import Database from 'better-sqlite3';

let mockDb: Database.Database;

// Mock the db module before importing output-buffer
vi.mock('./db.js', () => ({
  getRawDb: () => mockDb,
}));

// Import after mock is set up
const { appendOutput, getOutputSize, getVisibleOutputSize, clearOutput } =
  await import('./output-buffer.js');

function setupDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE terminal_session (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE terminal_output_buffer (
      session_id TEXT NOT NULL REFERENCES terminal_session(id) ON DELETE CASCADE,
      chunk BLOB NOT NULL,
      sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, sequence)
    );
  `);
  // Insert a dummy session so foreign keys pass
  db.prepare('INSERT INTO terminal_session (id) VALUES (?)').run('test-session');
  return db;
}

describe('output-buffer visible size tracking', () => {
  beforeEach(() => {
    mockDb = setupDb();
  });

  afterEach(() => {
    clearOutput('test-session');
    mockDb.close();
  });

  it('tracks raw size for plain text', () => {
    appendOutput('test-session', 'hello');
    expect(getOutputSize('test-session')).toBe(5);
  });

  it('tracks visible size excluding ANSI sequences', () => {
    // "red" is 3 visible chars, but the raw string is much longer
    appendOutput('test-session', '\x1b[31mred\x1b[0m');
    expect(getVisibleOutputSize('test-session')).toBe(3);
    expect(getOutputSize('test-session')).toBeGreaterThan(3);
  });

  it('accumulates visible size across multiple appends', () => {
    appendOutput('test-session', '\x1b[1mhello\x1b[0m'); // 5 visible
    appendOutput('test-session', '\x1b[32m world\x1b[0m'); // 6 visible
    expect(getVisibleOutputSize('test-session')).toBe(11);
  });

  it('returns 0 for ANSI-only output', () => {
    appendOutput('test-session', '\x1b[2J\x1b[H\x1b[?25l');
    expect(getVisibleOutputSize('test-session')).toBe(0);
  });

  it('resets visible size on clearOutput', () => {
    appendOutput('test-session', 'hello');
    expect(getVisibleOutputSize('test-session')).toBe(5);
    clearOutput('test-session');
    expect(getVisibleOutputSize('test-session')).toBe(0);
  });

  it('matches raw size for plain text without ANSI', () => {
    appendOutput('test-session', 'plain text here');
    expect(getVisibleOutputSize('test-session')).toBe(getOutputSize('test-session'));
  });
});
