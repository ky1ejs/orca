import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import { join } from 'node:path';
import * as schema from './schema.js';

export type OrcaDb = BetterSQLite3Database<typeof schema>;

let db: OrcaDb | null = null;
let sqlite: Database.Database | null = null;

export function getDb(): OrcaDb {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function getRawDb(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized. Call initDb() first.');
  return sqlite;
}

export function createDb(sqliteDb: Database.Database, migrationsFolder: string): OrcaDb {
  const d = drizzle(sqliteDb, { schema });
  migrate(d, { migrationsFolder });
  return d;
}

export function initDb(dbPath?: string): OrcaDb {
  const path = dbPath ?? join(app.getPath('userData'), 'orca.db');
  sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  db = createDb(sqlite, join(app.getAppPath(), 'drizzle'));
  return db;
}

export function closeDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
