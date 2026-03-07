import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminal_session (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      pid INTEGER,
      status TEXT NOT NULL DEFAULT 'STARTING',
      working_directory TEXT,
      started_at TEXT,
      stopped_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS terminal_output_buffer (
      session_id TEXT NOT NULL REFERENCES terminal_session(id) ON DELETE CASCADE,
      chunk BLOB NOT NULL,
      sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS auth_token (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      server_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
