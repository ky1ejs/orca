import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkWorktreeSafety } from './worktree-safety.js';

vi.mock('./git.js', () => ({
  git: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { git } = await import('./git.js');
const mockGit = vi.mocked(git);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('checkWorktreeSafety', () => {
  const worktreePath = '/tmp/worktree';
  const repoPath = '/tmp/repo';
  const branchName = 'feat/ORCA-1-test';
  const baseBranch = 'main';

  describe('dirty check', () => {
    it('returns dirty=false when working directory is clean', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) return '';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged')) return '  feat/ORCA-1-test\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.dirty).toBe(false);
    });

    it('returns dirty=true when working directory has changes', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return ' M src/index.ts';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) return '';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged')) return '  feat/ORCA-1-test\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.dirty).toBe(true);
    });
  });

  describe('unpushedCommits check', () => {
    it('returns unpushedCommits=false when origin branch matches HEAD', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) return '';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged')) return '  feat/ORCA-1-test\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.unpushedCommits).toBe(false);
    });

    it('returns unpushedCommits=true when commits exist beyond origin branch', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) return 'abc1234 some commit';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged')) return '  feat/ORCA-1-test\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.unpushedCommits).toBe(true);
    });

    it('falls back to baseBranch comparison when no remote branch exists', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) throw new Error('no remote');
        if (args.includes('main..HEAD')) return '';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged')) return '  feat/ORCA-1-test\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.unpushedCommits).toBe(false);
    });

    it('defaults to true when all commit checks fail', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) throw new Error('fail');
        if (args.includes('main..HEAD')) throw new Error('fail');
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged')) return '';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.unpushedCommits).toBe(true);
    });
  });

  describe('branchMerged check', () => {
    it('returns branchMerged=true when branch is merged into origin/baseBranch', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) return '';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged') && args.includes('origin/main'))
          return '  feat/ORCA-1-test\n  main\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.branchMerged).toBe(true);
    });

    it('falls back to local baseBranch when origin check fails', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) return '';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged') && args.includes('origin/main')) throw new Error('no remote');
        if (args.includes('--merged') && args.includes('main')) return '  feat/ORCA-1-test\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.branchMerged).toBe(true);
    });

    it('returns branchMerged=false when branch is not merged', async () => {
      mockGit.mockImplementation(async (_cwd, args) => {
        if (args.includes('--porcelain')) return '';
        if (args.includes('origin/feat/ORCA-1-test..HEAD')) return '';
        if (args[0] === 'fetch') return '';
        if (args.includes('--merged')) return '  main\n';
        return '';
      });

      const result = await checkWorktreeSafety(worktreePath, repoPath, branchName, baseBranch);
      expect(result.branchMerged).toBe(false);
    });
  });
});
