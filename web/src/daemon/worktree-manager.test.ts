import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import * as schema from '../shared/db/schema.js';
import { slugify, isGitRepo } from './worktree-manager.js';

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

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Dynamic import after mocks are set up
const { WorktreeManager } = await import('./worktree-manager.js');

function createTempGitRepo(): string {
  // realpathSync resolves macOS /var → /private/var symlink to match git's --show-toplevel
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-wt-test-')));
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'orca-test@example.com'], {
    stdio: 'pipe',
  });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Orca Test'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init'], { stdio: 'pipe' });
  return dir;
}

const metadata = {
  displayId: 'ORCA-42',
  title: 'Add user authentication',
  description: null,
  projectName: 'Test Project',
  workspaceSlug: 'test-ws',
};

describe('slugify', () => {
  it('converts to lowercase and replaces non-alphanum with hyphens', () => {
    expect(slugify('Add User Authentication')).toBe('add-user-authentication');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('foo---bar   baz')).toBe('foo-bar-baz');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('truncates to 40 chars without trailing hyphen', () => {
    const long = 'a'.repeat(50);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('-')).toBe(false);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles special characters', () => {
    expect(slugify('Fix bug #123 (urgent!)')).toBe('fix-bug-123-urgent');
  });
});

describe('isGitRepo', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-git-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns true for a git repo', async () => {
    execFileSync('git', ['init', tempDir], { stdio: 'pipe' });
    expect(await isGitRepo(tempDir)).toBe(true);
  });

  it('returns false for a non-git directory', async () => {
    expect(await isGitRepo(tempDir)).toBe(false);
  });

  it('returns false for a non-existent directory', async () => {
    expect(await isGitRepo('/tmp/nonexistent-dir-abc123')).toBe(false);
  });
});

describe('WorktreeManager', () => {
  let manager: InstanceType<typeof WorktreeManager>;
  let repoDir: string;
  let tempWorktreesDir: string;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    testDb = drizzle(sqlite, { schema });
    migrate(testDb, { migrationsFolder });
    tempWorktreesDir = mkdtempSync(join(tmpdir(), 'orca-wt-dir-'));
    manager = new WorktreeManager(tempWorktreesDir);
    repoDir = createTempGitRepo();
  });

  afterEach(() => {
    sqlite.close();
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(tempWorktreesDir, { recursive: true, force: true });
  });

  describe('ensureWorktree', () => {
    it('creates a new worktree and returns its path', async () => {
      const result = await manager.ensureWorktree('task-1', repoDir, metadata);

      expect(result.created).toBe(true);
      expect(result.path).toContain(tempWorktreesDir);
      expect(result.path).toContain('feat/ORCA-42-add-user-authentication');
      expect(existsSync(result.path)).toBe(true);

      // Verify DB row was created
      const { getWorktree } = await import('./worktrees.js');
      const row = getWorktree('task-1');
      expect(row).toBeDefined();
      expect(row!.worktree_path).toBe(result.path);
      expect(row!.branch_name).toBe('feat/ORCA-42-add-user-authentication');
      expect(row!.repo_path).toBe(repoDir);

      // Clean up the worktree
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result.path, '--force'], {
        stdio: 'pipe',
      });
    });

    it('reuses an existing worktree when row and dir exist', async () => {
      const result1 = await manager.ensureWorktree('task-1', repoDir, metadata);
      const result2 = await manager.ensureWorktree('task-1', repoDir, metadata);

      expect(result1.path).toBe(result2.path);
      expect(result1.created).toBe(true);
      expect(result2.created).toBe(false);

      // Clean up
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result1.path, '--force'], {
        stdio: 'pipe',
      });
    });

    it('cleans stale row and creates fresh when directory is missing', async () => {
      const result1 = await manager.ensureWorktree('task-1', repoDir, metadata);

      // Simulate directory being deleted externally
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result1.path, '--force'], {
        stdio: 'pipe',
      });

      // ensureWorktree should detect the stale row, clean it, and create fresh
      const result2 = await manager.ensureWorktree('task-1', repoDir, metadata);

      expect(result2.created).toBe(true);
      expect(existsSync(result2.path)).toBe(true);

      // Clean up
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result2.path, '--force'], {
        stdio: 'pipe',
      });
    });

    it('reuses an existing branch when it already exists', async () => {
      // Create the worktree first, then remove just the directory (not the branch)
      const result1 = await manager.ensureWorktree('task-1', repoDir, metadata);
      const { getWorktree, deleteWorktree } = await import('./worktrees.js');
      const row = getWorktree('task-1')!;
      const branchName = row.branch_name;

      // Remove worktree but keep the branch
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result1.path, '--force'], {
        stdio: 'pipe',
      });
      deleteWorktree('task-1');

      // Branch should still exist
      const branchCheck = execFileSync(
        'git',
        ['-C', repoDir, 'rev-parse', '--verify', branchName],
        { stdio: 'pipe', encoding: 'utf-8' },
      );
      expect(branchCheck.trim()).toBeTruthy();

      // ensureWorktree should detect the existing branch and reuse it
      const result2 = await manager.ensureWorktree('task-1', repoDir, metadata);
      expect(result2.created).toBe(true);
      expect(existsSync(result2.path)).toBe(true);

      // Clean up
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result2.path, '--force'], {
        stdio: 'pipe',
      });
    });

    it('reuses an orphaned worktree when directory exists but DB record is missing', async () => {
      const result1 = await manager.ensureWorktree('task-1', repoDir, metadata);
      const { deleteWorktree } = await import('./worktrees.js');

      // Simulate lost DB record (e.g. daemon restart wipe) while worktree directory remains
      deleteWorktree('task-1');

      const result2 = await manager.ensureWorktree('task-1', repoDir, metadata);
      expect(result2.path).toBe(result1.path);
      expect(existsSync(result2.path)).toBe(true);

      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result2.path, '--force'], {
        stdio: 'pipe',
      });
    });

    it('handles empty slug gracefully', async () => {
      const emptyTitleMeta = { ...metadata, title: '' };
      const result = await manager.ensureWorktree('task-empty', repoDir, emptyTitleMeta);

      expect(result.path).toContain('feat/ORCA-42');
      // Branch name should not have a trailing hyphen
      const { getWorktree } = await import('./worktrees.js');
      const row = getWorktree('task-empty')!;
      expect(row.branch_name).toBe('feat/ORCA-42');

      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result.path, '--force'], {
        stdio: 'pipe',
      });
    });

    it('serializes concurrent calls for the same repo', async () => {
      const meta1 = { ...metadata, displayId: 'ORCA-1', title: 'First task' };
      const meta2 = { ...metadata, displayId: 'ORCA-2', title: 'Second task' };

      // Launch both concurrently
      const [result1, result2] = await Promise.all([
        manager.ensureWorktree('task-a', repoDir, meta1),
        manager.ensureWorktree('task-b', repoDir, meta2),
      ]);

      // Both should succeed without git lock contention
      expect(existsSync(result1.path)).toBe(true);
      expect(existsSync(result2.path)).toBe(true);
      expect(result1.path).not.toBe(result2.path);

      // Clean up
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result1.path, '--force'], {
        stdio: 'pipe',
      });
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', result2.path, '--force'], {
        stdio: 'pipe',
      });
    });
  });

  describe('removeWorktree', () => {
    it('removes worktree, deletes branch, and cleans DB row', async () => {
      const { path } = await manager.ensureWorktree('task-1', repoDir, metadata);
      expect(existsSync(path)).toBe(true);

      await manager.removeWorktree('task-1');

      expect(existsSync(path)).toBe(false);

      const { getWorktree } = await import('./worktrees.js');
      expect(getWorktree('task-1')).toBeUndefined();
    });

    it('is a no-op for non-existent task', async () => {
      // Should not throw
      await manager.removeWorktree('nonexistent');
    });

    it('cleans DB row even if directory is already gone', async () => {
      const { insertWorktree, getWorktree } = await import('./worktrees.js');
      insertWorktree({
        task_id: 'task-orphan',
        worktree_path: '/tmp/nonexistent-worktree',
        branch_name: 'feat/orphan',
        base_branch: 'main',
        repo_path: repoDir,
      });

      await manager.removeWorktree('task-orphan');
      expect(getWorktree('task-orphan')).toBeUndefined();
    });
  });
});
