import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

describe('database client', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  it('creates tables with migrations', () => {
    db = new Database(':memory:');
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('terminal_session');
    expect(tableNames).toContain('terminal_output_buffer');
    expect(tableNames).toContain('auth_token');
  });

  it('migrations are idempotent', () => {
    db = new Database(':memory:');
    runMigrations(db);
    runMigrations(db); // Should not throw

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('terminal_session');
  });
});
