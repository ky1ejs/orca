import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type OrcaDb = BetterSQLite3Database<typeof schema>;

let db: OrcaDb | null = null;

export function getDb(): OrcaDb {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function createDb(sqliteDb: Database.Database, migrationsFolder: string): OrcaDb {
  const d = drizzle(sqliteDb, { schema });
  migrate(d, { migrationsFolder });
  return d;
}
