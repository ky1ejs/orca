// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { WorktreeGetResult } from '../../../shared/daemon-protocol.js';

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

beforeEach(() => {
  (window as unknown as Record<string, unknown>).orca = {
    worktree: {
      get: mockGet,
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
  mockGet.mockResolvedValue(null);

  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(cleanup);

async function renderBadge(taskId = 'task-1') {
  const { TaskBranchBadge } = await import('./TaskBranchBadge.js');
  return render(<TaskBranchBadge taskId={taskId} />);
}

describe('TaskBranchBadge', () => {
  it('renders nothing when no worktree exists', async () => {
    mockGet.mockResolvedValue(null);
    const { container } = await renderBadge();

    // Wait for async effect
    await vi.waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('task-1');
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders branch name when worktree exists', async () => {
    mockGet.mockResolvedValue(mockWorktree);
    await renderBadge();

    await vi.waitFor(() => {
      expect(screen.getByText('feat/ORCA-1-fix-bug')).toBeInTheDocument();
    });
  });

  it('shows full branch name in title tooltip', async () => {
    mockGet.mockResolvedValue(mockWorktree);
    await renderBadge();

    await vi.waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Copy branch: feat/ORCA-1-fix-bug');
    });
  });

  it('copies branch name to clipboard on click', async () => {
    mockGet.mockResolvedValue(mockWorktree);
    await renderBadge();

    await vi.waitFor(() => {
      expect(screen.getByText('feat/ORCA-1-fix-bug')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('feat/ORCA-1-fix-bug');
    });
  });

  it('shows Copied! tooltip after clicking', async () => {
    mockGet.mockResolvedValue(mockWorktree);
    await renderBadge();

    await vi.waitFor(() => {
      expect(screen.getByText('feat/ORCA-1-fix-bug')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));

    await vi.waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Copied!');
    });
  });
});
