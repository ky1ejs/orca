import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { createDb } from './client.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

describe('drizzle migrations', () => {
  let sqlite: Database.Database;

  afterEach(() => {
    if (sqlite) sqlite.close();
  });

  it('creates all tables on fresh install', () => {
    sqlite = new Database(':memory:');
    createDb(sqlite, migrationsFolder);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('terminal_session');
    expect(tableNames).toContain('terminal_output_buffer');
    expect(tableNames).toContain('auth_token');
    expect(tableNames).toContain('__drizzle_migrations');
  });

  it('is idempotent — migrate twice without error', () => {
    sqlite = new Database(':memory:');
    createDb(sqlite, migrationsFolder);

    // Second migration call should not throw
    expect(() => createDb(sqlite, migrationsFolder)).not.toThrow();
  });

  it('upgrades pre-existing database (tables already exist, no __drizzle_migrations)', () => {
    sqlite = new Database(':memory:');

    // Simulate the old runMigrations creating tables
    sqlite.exec(`
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

    // Insert some data to verify it survives migration
    sqlite
      .prepare(
        `INSERT INTO terminal_session (id, status, created_at) VALUES (?, 'RUNNING', datetime('now'))`,
      )
      .run('existing-session');

    // Drizzle migration should apply cleanly thanks to IF NOT EXISTS
    expect(() => createDb(sqlite, migrationsFolder)).not.toThrow();

    // Data should still be there
    const session = sqlite
      .prepare('SELECT * FROM terminal_session WHERE id = ?')
      .get('existing-session') as { id: string; status: string };
    expect(session).toBeTruthy();
    expect(session.status).toBe('RUNNING');

    // __drizzle_migrations should now exist
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toContain('__drizzle_migrations');
  });

  it('fresh migration produces correct table structure', () => {
    sqlite = new Database(':memory:');
    createDb(sqlite, migrationsFolder);

    // Check terminal_session columns
    const sessionCols = sqlite.prepare('PRAGMA table_info(terminal_session)').all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    const sessionColNames = sessionCols.map((c) => c.name);
    expect(sessionColNames).toEqual([
      'id',
      'task_id',
      'pid',
      'status',
      'working_directory',
      'started_at',
      'stopped_at',
      'created_at',
    ]);

    // Check terminal_output_buffer columns
    const bufferCols = sqlite.prepare('PRAGMA table_info(terminal_output_buffer)').all() as Array<{
      name: string;
    }>;
    const bufferColNames = bufferCols.map((c) => c.name);
    expect(bufferColNames).toEqual(['session_id', 'chunk', 'sequence', 'created_at']);

    // Check auth_token columns
    const authCols = sqlite.prepare('PRAGMA table_info(auth_token)').all() as Array<{
      name: string;
    }>;
    const authColNames = authCols.map((c) => c.name);
    expect(authColNames).toEqual(['id', 'token', 'server_url', 'created_at']);
  });
});
