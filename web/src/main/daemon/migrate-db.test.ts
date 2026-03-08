import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateDb } from './migrate-db.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'migrate-db-test-'));
});

afterEach(() => {
  // Restore permissions before cleanup in case a test set read-only
  try {
    chmodSync(join(tempDir, 'readonly'), 0o755);
  } catch {
    // May not exist
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe('migrateDb', () => {
  it('returns migrated: false when new DB already exists', () => {
    const newDbPath = join(tempDir, 'new', 'orca.db');
    const oldDir = join(tempDir, 'old');
    const oldDbPath = join(oldDir, 'orca.db');

    mkdirSync(join(tempDir, 'new'), { recursive: true });
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(newDbPath, 'new-data');
    writeFileSync(oldDbPath, 'old-data');

    const result = migrateDb(newDbPath, oldDbPath);
    expect(result).toEqual({ migrated: false });
    expect(readFileSync(newDbPath, 'utf-8')).toBe('new-data');
  });

  it('returns migrated: false when no old DB exists', () => {
    const newDbPath = join(tempDir, 'new', 'orca.db');
    const oldDbPath = join(tempDir, 'old', 'orca.db');

    const result = migrateDb(newDbPath, oldDbPath);
    expect(result).toEqual({ migrated: false });
    expect(existsSync(newDbPath)).toBe(false);
  });

  it('copies db file on successful migration', () => {
    const newDbPath = join(tempDir, 'new', 'orca.db');
    const oldDir = join(tempDir, 'old');
    const oldDbPath = join(oldDir, 'orca.db');

    mkdirSync(oldDir, { recursive: true });
    writeFileSync(oldDbPath, 'db-content');

    const result = migrateDb(newDbPath, oldDbPath);
    expect(result).toEqual({ migrated: true });
    expect(existsSync(newDbPath)).toBe(true);
    expect(readFileSync(newDbPath, 'utf-8')).toBe('db-content');
  });

  it('copies WAL and SHM files when present', () => {
    const newDbPath = join(tempDir, 'new', 'orca.db');
    const oldDir = join(tempDir, 'old');
    const oldDbPath = join(oldDir, 'orca.db');

    mkdirSync(oldDir, { recursive: true });
    writeFileSync(oldDbPath, 'db-content');
    writeFileSync(oldDbPath + '-wal', 'wal-content');
    writeFileSync(oldDbPath + '-shm', 'shm-content');

    const result = migrateDb(newDbPath, oldDbPath);
    expect(result).toEqual({ migrated: true });
    expect(readFileSync(newDbPath + '-wal', 'utf-8')).toBe('wal-content');
    expect(readFileSync(newDbPath + '-shm', 'utf-8')).toBe('shm-content');
  });

  it('migrates successfully when WAL/SHM are missing', () => {
    const newDbPath = join(tempDir, 'new', 'orca.db');
    const oldDir = join(tempDir, 'old');
    const oldDbPath = join(oldDir, 'orca.db');

    mkdirSync(oldDir, { recursive: true });
    writeFileSync(oldDbPath, 'db-content');

    const result = migrateDb(newDbPath, oldDbPath);
    expect(result).toEqual({ migrated: true });
    expect(readFileSync(newDbPath, 'utf-8')).toBe('db-content');
    expect(existsSync(newDbPath + '-wal')).toBe(false);
    expect(existsSync(newDbPath + '-shm')).toBe(false);
  });

  it('preserves old DB files after migration', () => {
    const newDbPath = join(tempDir, 'new', 'orca.db');
    const oldDir = join(tempDir, 'old');
    const oldDbPath = join(oldDir, 'orca.db');

    mkdirSync(oldDir, { recursive: true });
    writeFileSync(oldDbPath, 'db-content');
    writeFileSync(oldDbPath + '-wal', 'wal-content');

    migrateDb(newDbPath, oldDbPath);

    expect(existsSync(oldDbPath)).toBe(true);
    expect(existsSync(oldDbPath + '-wal')).toBe(true);
    expect(readFileSync(oldDbPath, 'utf-8')).toBe('db-content');
  });

  it('returns migrated: false on copy failure without throwing', () => {
    // Create a read-only directory so mkdirSync fails
    const readonlyDir = join(tempDir, 'readonly');
    mkdirSync(readonlyDir, { recursive: true });
    chmodSync(readonlyDir, 0o444);

    const newDbPath = join(readonlyDir, 'subdir', 'orca.db');
    const oldDir = join(tempDir, 'old');
    const oldDbPath = join(oldDir, 'orca.db');

    mkdirSync(oldDir, { recursive: true });
    writeFileSync(oldDbPath, 'db-content');

    const result = migrateDb(newDbPath, oldDbPath);
    expect(result.migrated).toBe(false);
  });
});
