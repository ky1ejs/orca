import { eq, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { userPreference } from './schema.js';

export interface UserPreference {
  key: string;
  value: string;
}

export function getPreference(key: string): string | undefined {
  const db = getDb();
  const row = db.select().from(userPreference).where(eq(userPreference.key, key)).get();
  return row?.value;
}

export function setPreference(key: string, value: string): UserPreference {
  const db = getDb();
  db.insert(userPreference)
    .values({ key, value })
    .onConflictDoUpdate({
      target: userPreference.key,
      set: {
        value,
        updated_at: sql`datetime('now')`,
      },
    })
    .run();

  return { key, value };
}

export function getAllPreferences(): UserPreference[] {
  const db = getDb();
  return db
    .select({ key: userPreference.key, value: userPreference.value })
    .from(userPreference)
    .all();
}
