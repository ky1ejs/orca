// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { WorktreeGetResult } from '../../shared/daemon-protocol.js';

const mockWorktree: WorktreeGetResult = {
  task_id: 'task-1',
  worktree_path: '/Users/test/.orca/worktrees/my-app/feat/ORCA-1-fix-bug',
  branch_name: 'feat/ORCA-1-fix-bug',
  base_branch: 'main',
  repo_path: '/Users/test/projects/my-app',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockGet = vi.fn();
const mockRemove = vi.fn();

beforeEach(() => {
  (globalThis as unknown as { window: { orca: unknown } }).window = {
    orca: {
      worktree: {
        get: mockGet,
        remove: mockRemove,
      },
    },
  };
  mockGet.mockResolvedValue(null);
  mockRemove.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useWorktree', () => {
  it('returns null and loading false when no taskId', async () => {
    const { useWorktree } = await import('./useWorktree.js');
    const { result } = renderHook(() => useWorktree(undefined));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.worktree).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches worktree data for a taskId', async () => {
    mockGet.mockResolvedValue(mockWorktree);
    const { useWorktree } = await import('./useWorktree.js');
    const { result } = renderHook(() => useWorktree('task-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledWith('task-1');
    expect(result.current.worktree).toEqual(mockWorktree);
    expect(result.current.loading).toBe(false);
  });

  it('returns null when no worktree exists for task', async () => {
    mockGet.mockResolvedValue(null);
    const { useWorktree } = await import('./useWorktree.js');
    const { result } = renderHook(() => useWorktree('task-2'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.worktree).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('handles fetch errors gracefully', async () => {
    mockGet.mockRejectedValue(new Error('IPC error'));
    const { useWorktree } = await import('./useWorktree.js');
    const { result } = renderHook(() => useWorktree('task-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.worktree).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('removeWorktree calls API and refetches', async () => {
    mockGet.mockResolvedValue(mockWorktree);
    const { useWorktree } = await import('./useWorktree.js');
    const { result } = renderHook(() => useWorktree('task-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.worktree).toEqual(mockWorktree);

    mockGet.mockResolvedValue(null);
    await act(async () => {
      await result.current.removeWorktree();
    });

    expect(mockRemove).toHaveBeenCalledWith('task-1', undefined);
    expect(result.current.worktree).toBeNull();
  });

  it('removeWorktree passes force flag', async () => {
    mockGet.mockResolvedValue(mockWorktree);
    const { useWorktree } = await import('./useWorktree.js');
    const { result } = renderHook(() => useWorktree('task-1'));

    await act(async () => {
      await Promise.resolve();
    });

    mockGet.mockResolvedValue(null);
    await act(async () => {
      await result.current.removeWorktree(true);
    });

    expect(mockRemove).toHaveBeenCalledWith('task-1', true);
  });

  it('refetch re-fetches worktree data', async () => {
    mockGet.mockResolvedValue(null);
    const { useWorktree } = await import('./useWorktree.js');
    const { result } = renderHook(() => useWorktree('task-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.worktree).toBeNull();

    mockGet.mockResolvedValue(mockWorktree);
    await act(async () => {
      result.current.refetch();
      await Promise.resolve();
    });

    expect(result.current.worktree).toEqual(mockWorktree);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
