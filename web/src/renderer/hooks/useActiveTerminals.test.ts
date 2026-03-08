// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { SessionStatus } from '../../shared/session-status.js';
import type { TerminalSessionInfo } from './useTerminalSessions.js';

const mockSessions = vi.fn<() => TerminalSessionInfo[]>(() => []);
vi.mock('./useTerminalSessions.js', () => ({
  useTerminalSessions: () => ({ sessions: mockSessions(), loading: false, refresh: vi.fn() }),
}));

const { useActiveTerminals } = await import('./useActiveTerminals.js');

const projects = [
  {
    id: 'proj-1',
    name: 'Project Alpha',
    tasks: [
      { id: 'task-1', displayId: 'TSK-1', title: 'First Task' },
      { id: 'task-2', displayId: 'TSK-2', title: 'Second Task' },
    ],
  },
];

function makeSession(overrides: Partial<TerminalSessionInfo> = {}): TerminalSessionInfo {
  return {
    id: 'sess-1',
    task_id: 'task-1',
    pid: 1234,
    status: SessionStatus.Running,
    working_directory: '/tmp',
    started_at: '2024-01-01T00:00:00Z',
    stopped_at: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockSessions.mockReturnValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useActiveTerminals', () => {
  it('AWAITING_PERMISSION takes priority over WAITING_FOR_INPUT', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.WaitingForInput }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.AwaitingPermission }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].status).toBe(SessionStatus.AwaitingPermission);
  });

  it('AWAITING_PERMISSION takes priority over RUNNING', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.AwaitingPermission }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].status).toBe(SessionStatus.AwaitingPermission);
  });

  it('WAITING_FOR_INPUT takes priority over RUNNING', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.WaitingForInput }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].status).toBe(SessionStatus.WaitingForInput);
  });

  it('RUNNING takes priority over STARTING', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Starting }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.Running }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].status).toBe(SessionStatus.Running);
  });

  it('returns empty when no active sessions', () => {
    mockSessions.mockReturnValue([]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current).toHaveLength(0);
  });

  it('excludes exited sessions', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Exited }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current).toHaveLength(0);
  });

  it('groups sessions by task and reports correct session count', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.Running }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].sessionCount).toBe(2);
    expect(result.current[0].taskId).toBe('task-1');
    expect(result.current[0].displayId).toBe('TSK-1');
    expect(result.current[0].taskTitle).toBe('First Task');
    expect(result.current[0].projectName).toBe('Project Alpha');
  });
});
