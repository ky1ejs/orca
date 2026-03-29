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
        getSessionsByTask: vi
          .fn()
          .mockImplementation((taskId: string) =>
            Promise.resolve(mockSessions.filter((s) => s.task_id === taskId)),
          ),
      },
      lifecycle: {
        onSessionStatusChanged: vi.fn().mockReturnValue(() => {}),
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

  it('filters sessions by taskId using server-side query', async () => {
    const { result } = renderHook(() => useTerminalSessions('task-a'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('session-1');
    expect(window.orca.db.getSessionsByTask).toHaveBeenCalledWith('task-a');
    expect(window.orca.db.getSessions).not.toHaveBeenCalled();
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

  it('does not update state when poll returns identical data', async () => {
    const getSessions = vi.fn().mockResolvedValue(mockSessions);
    (
      window as unknown as { orca: { db: { getSessions: typeof getSessions } } }
    ).orca.db.getSessions = getSessions;

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Capture the reference after initial load
    const firstRef = result.current.sessions;
    expect(firstRef).toHaveLength(2);

    // Poll returns identical data (same ids, same statuses)
    getSessions.mockResolvedValue([...mockSessions]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Should be the same reference (no state update)
    expect(result.current.sessions).toBe(firstRef);
  });

  it('does not update state when IPC status matches current status', async () => {
    let statusChangedCallback: ((sessionId: string, status: string) => void) | null = null;
    (
      window as unknown as {
        orca: { lifecycle: { onSessionStatusChanged: ReturnType<typeof vi.fn> } };
      }
    ).orca.lifecycle.onSessionStatusChanged = vi.fn((cb: typeof statusChangedCallback) => {
      statusChangedCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const firstRef = result.current.sessions;

    // Send the same status that already exists
    act(() => {
      statusChangedCallback!('session-1', SessionStatus.Running);
    });

    // Should be the same reference (no state update)
    expect(result.current.sessions).toBe(firstRef);
  });

  it('updates session status via IPC listener', async () => {
    let statusChangedCallback: ((sessionId: string, status: string) => void) | null = null;
    (
      window as unknown as {
        orca: { lifecycle: { onSessionStatusChanged: ReturnType<typeof vi.fn> } };
      }
    ).orca.lifecycle.onSessionStatusChanged = vi.fn((cb: typeof statusChangedCallback) => {
      statusChangedCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.sessions[0].status).toBe(SessionStatus.Running);
    expect(statusChangedCallback).not.toBeNull();

    // Simulate IPC status change
    act(() => {
      statusChangedCallback!('session-1', SessionStatus.AwaitingPermission);
    });

    expect(result.current.sessions[0].status).toBe(SessionStatus.AwaitingPermission);
  });

  it('handles getSessions error gracefully (daemon disconnected)', async () => {
    const getSessions = vi.fn().mockRejectedValue(new Error('Not connected to daemon'));
    (
      window as unknown as { orca: { db: { getSessions: typeof getSessions } } }
    ).orca.db.getSessions = getSessions;

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should not throw, sessions should remain empty, loading should be false
    expect(result.current.sessions).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });
});
