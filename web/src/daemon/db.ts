/**
 * Database initialization for the daemon process.
 * Uses explicit paths instead of Electron's app.getPath().
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../shared/db/schema.js';

type OrcaDb = BetterSQLite3Database<typeof schema>;

let db: OrcaDb | null = null;
let sqlite: Database.Database | null = null;

export function getDb(): OrcaDb {
  if (!db) throw new Error('Database not initialized. Call initDaemonDb() first.');
  return db;
}

export function getRawDb(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized. Call initDaemonDb() first.');
  return sqlite;
}

export function initDaemonDb(dbPath: string, migrationsFolder: string): OrcaDb {
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

export function closeDaemonDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
