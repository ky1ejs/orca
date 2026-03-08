// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useTerminalSessions, type TerminalSessionInfo } from './useTerminalSessions.js';
import { SessionStatus } from '../../shared/session-status.js';

const mockSessions: TerminalSessionInfo[] = [
  {
    id: 'session-1',
    task_id: 'task-a',
    pid: 1234,
    status: SessionStatus.Running,
    working_directory: '/tmp',
    started_at: '2024-01-01T00:00:00Z',
    stopped_at: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'session-2',
    task_id: 'task-b',
    pid: 5678,
    status: SessionStatus.Exited,
    working_directory: '/tmp',
    started_at: '2024-01-01T00:00:00Z',
    stopped_at: '2024-01-01T01:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as unknown as { window: { orca: unknown } }).window = {
    orca: {
      db: {
        getSessions: vi.fn().mockResolvedValue(mockSessions),
      },
    },
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useTerminalSessions', () => {
  it('returns all sessions when no taskId filter', async () => {
    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  it('filters sessions by taskId', async () => {
    const { result } = renderHook(() => useTerminalSessions('task-a'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('session-1');
  });

  it('polls for updates', async () => {
    const getSessions = vi.fn().mockResolvedValue(mockSessions);
    (
      window as unknown as { orca: { db: { getSessions: typeof getSessions } } }
    ).orca.db.getSessions = getSessions;

    renderHook(() => useTerminalSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(getSessions).toHaveBeenCalledTimes(2);
  });

  it('refresh triggers immediate re-fetch', async () => {
    const getSessions = vi.fn().mockResolvedValue(mockSessions);
    (
      window as unknown as { orca: { db: { getSessions: typeof getSessions } } }
    ).orca.db.getSessions = getSessions;

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSessions).toHaveBeenCalledTimes(2);
  });
});
