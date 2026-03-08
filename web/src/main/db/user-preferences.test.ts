import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { createDb } from './client.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

// Mock getDb to return our test db
let testDb: ReturnType<typeof createDb>;

vi.mock('./client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./client.js')>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

// Dynamic import after mocks
const { getPreference, setPreference, getAllPreferences } = await import('./user-preferences.js');

describe('user-preferences', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    testDb = createDb(sqlite, migrationsFolder);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns undefined for non-existent key', () => {
    expect(getPreference('missing')).toBeUndefined();
  });

  it('sets and gets a preference', () => {
    const result = setPreference('theme', 'dark');
    expect(result).toEqual({ key: 'theme', value: 'dark' });
    expect(getPreference('theme')).toBe('dark');
  });

  it('updates an existing preference', () => {
    setPreference('font', 'monospace');
    setPreference('font', 'JetBrains Mono');
    expect(getPreference('font')).toBe('JetBrains Mono');
  });

  it('gets all preferences', () => {
    setPreference('a', '1');
    setPreference('b', '2');
    const all = getAllPreferences();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual({ key: 'a', value: '1' });
    expect(all).toContainEqual({ key: 'b', value: '2' });
  });

  it('returns empty array when no preferences exist', () => {
    expect(getAllPreferences()).toEqual([]);
  });
});
