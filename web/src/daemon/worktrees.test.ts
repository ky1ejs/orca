import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import * as schema from '../shared/db/schema.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

let testDb: ReturnType<typeof drizzle>;
let sqlite: Database.Database;

vi.mock('./db.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./db.js')>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

const { getWorktree, insertWorktree, deleteWorktree } = await import('./worktrees.js');

const sampleInput = {
  task_id: 'cmtest123',
  worktree_path: '/tmp/worktrees/feat-branch',
  branch_name: 'feat/ORCA-1-test',
  base_branch: 'main',
  repo_path: '/tmp/repo',
};

describe('worktrees', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    testDb = drizzle(sqlite, { schema });
    migrate(testDb, { migrationsFolder });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('inserts and retrieves a worktree', () => {
    const result = insertWorktree(sampleInput);

    expect(result.task_id).toBe(sampleInput.task_id);
    expect(result.worktree_path).toBe(sampleInput.worktree_path);
    expect(result.branch_name).toBe(sampleInput.branch_name);
    expect(result.base_branch).toBe(sampleInput.base_branch);
    expect(result.repo_path).toBe(sampleInput.repo_path);
    expect(result.created_at).toBeDefined();
    expect(result.updated_at).toBeDefined();

    const retrieved = getWorktree(sampleInput.task_id);
    expect(retrieved).toEqual(result);
  });

  it('returns undefined for non-existent task', () => {
    expect(getWorktree('nonexistent')).toBeUndefined();
  });

  it('deletes a worktree', () => {
    insertWorktree(sampleInput);
    deleteWorktree(sampleInput.task_id);
    expect(getWorktree(sampleInput.task_id)).toBeUndefined();
  });

  it('throws on duplicate task_id', () => {
    insertWorktree(sampleInput);
    expect(() => insertWorktree(sampleInput)).toThrow();
  });
});
