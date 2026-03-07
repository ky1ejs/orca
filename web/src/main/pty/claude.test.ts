import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockExecSync = vi.fn();

vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

const { findClaudePath, spawnClaudeCode } = await import('./claude.js');

describe('claude', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  describe('findClaudePath', () => {
    it('returns path when claude is found', () => {
      mockExecSync.mockReturnValue('/usr/local/bin/claude\n');

      const result = findClaudePath();
      expect(result).toBe('/usr/local/bin/claude');
    });

    it('returns null when claude is not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const result = findClaudePath();
      expect(result).toBeNull();
    });

    it('returns first path when multiple paths are returned', () => {
      mockExecSync.mockReturnValue('/usr/local/bin/claude\n/opt/bin/claude\n');

      const result = findClaudePath();
      expect(result).toBe('/usr/local/bin/claude');
    });
  });

  describe('spawnClaudeCode', () => {
    it('throws when claude is not on PATH', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const mockManager = { spawn: vi.fn() };

      expect(() => spawnClaudeCode(mockManager as never, 'session-1', '/tmp')).toThrow(
        'Claude CLI not found on PATH',
      );
      expect(mockManager.spawn).not.toHaveBeenCalled();
    });

    it('spawns via manager when claude is found', () => {
      mockExecSync.mockReturnValue('/usr/local/bin/claude\n');

      const mockManager = { spawn: vi.fn() };

      spawnClaudeCode(mockManager as never, 'session-1', '/tmp');
      expect(mockManager.spawn).toHaveBeenCalledWith(
        'session-1',
        '/usr/local/bin/claude',
        [],
        '/tmp',
      );
    });

    it('passes initial context as --print arg', () => {
      mockExecSync.mockReturnValue('/usr/local/bin/claude\n');

      const mockManager = { spawn: vi.fn() };

      spawnClaudeCode(mockManager as never, 'session-1', '/tmp', 'Fix the bug');
      expect(mockManager.spawn).toHaveBeenCalledWith(
        'session-1',
        '/usr/local/bin/claude',
        ['--print', 'Fix the bug'],
        '/tmp',
      );
    });
  });
});
