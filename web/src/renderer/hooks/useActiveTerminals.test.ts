// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { SessionStatus } from '../../shared/session-status.js';
import type { TerminalSessionInfo } from './useTerminalSessions.js';

const mockSessions = vi.fn<() => TerminalSessionInfo[]>(() => []);
vi.mock('./useTerminalSessions.js', () => ({
  useTerminalSessions: () => ({ sessions: mockSessions(), refresh: vi.fn() }),
}));

const { useActiveTerminals, pickPrimaryPr, isCloseable } = await import('./useActiveTerminals.js');
import { PullRequestStatus, CheckStatus } from '../graphql/__generated__/generated.js';

const projects = [
  {
    id: 'proj-1',
    name: 'Project Alpha',
    tasks: [
      { id: 'task-1', displayId: 'TSK-1', title: 'First Task', status: 'IN_PROGRESS' },
      { id: 'task-2', displayId: 'TSK-2', title: 'Second Task', status: 'TODO' },
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

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].status).toBe(SessionStatus.AwaitingPermission);
  });

  it('AWAITING_PERMISSION takes priority over RUNNING', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.AwaitingPermission }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].status).toBe(SessionStatus.AwaitingPermission);
  });

  it('WAITING_FOR_INPUT takes priority over RUNNING', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.WaitingForInput }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].status).toBe(SessionStatus.WaitingForInput);
  });

  it('RUNNING takes priority over STARTING', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Starting }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.Running }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].status).toBe(SessionStatus.Running);
  });

  it('returns empty when no active sessions', () => {
    mockSessions.mockReturnValue([]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries).toHaveLength(0);
  });

  it('excludes exited sessions', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Exited }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries).toHaveLength(0);
  });

  it('groups sessions by task and reports correct session count', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
      makeSession({ id: 'sess-2', task_id: 'task-1', status: SessionStatus.Running }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].sessionCount).toBe(2);
    expect(result.current.entries[0].taskId).toBe('task-1');
    expect(result.current.entries[0].displayId).toBe('TSK-1');
    expect(result.current.entries[0].taskTitle).toBe('First Task');
    expect(result.current.entries[0].projectName).toBe('Project Alpha');
  });

  it('includes pullRequest from task data', () => {
    const projectsWithPRs = [
      {
        id: 'proj-1',
        name: 'Project Alpha',
        tasks: [
          {
            id: 'task-1',
            displayId: 'TSK-1',
            title: 'First Task',
            status: 'IN_PROGRESS',
            pullRequests: [
              {
                id: 'pr-1',
                number: 42,
                status: PullRequestStatus.Open,
                draft: false,
                checkStatus: CheckStatus.Success,
                createdAt: '2024-01-01T00:00:00Z',
              },
            ],
          },
        ],
      },
    ];

    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projectsWithPRs));

    expect(result.current.entries[0].pullRequest).toEqual({
      number: 42,
      status: PullRequestStatus.Open,
      draft: false,
      checkStatus: CheckStatus.Success,
    });
  });

  it('returns no pullRequest when task has no PRs', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries[0].pullRequest).toBeUndefined();
  });

  it('includes taskStatus from project data', () => {
    mockSessions.mockReturnValue([
      makeSession({ id: 'sess-1', task_id: 'task-1', status: SessionStatus.Running }),
    ]);

    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(result.current.entries[0].taskStatus).toBe('IN_PROGRESS');
  });

  it('exposes refreshSessions callback', () => {
    const { result } = renderHook(() => useActiveTerminals(projects));

    expect(typeof result.current.refreshSessions).toBe('function');
  });
});

describe('pickPrimaryPr', () => {
  it('returns undefined for empty or undefined input', () => {
    expect(pickPrimaryPr(undefined)).toBeUndefined();
    expect(pickPrimaryPr([])).toBeUndefined();
  });

  it('prefers open PR over merged or closed', () => {
    const result = pickPrimaryPr([
      {
        id: 'pr-1',
        number: 10,
        status: PullRequestStatus.Merged,
        draft: false,
        checkStatus: null,
        createdAt: '2024-01-03T00:00:00Z',
      },
      {
        id: 'pr-2',
        number: 20,
        status: PullRequestStatus.Open,
        draft: false,
        checkStatus: CheckStatus.Success,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]);

    expect(result).toEqual({
      number: 20,
      status: PullRequestStatus.Open,
      draft: false,
      checkStatus: CheckStatus.Success,
    });
  });

  it('prefers merged PR over closed when no open PRs', () => {
    const result = pickPrimaryPr([
      {
        id: 'pr-1',
        number: 10,
        status: PullRequestStatus.Closed,
        draft: false,
        checkStatus: null,
        createdAt: '2024-01-02T00:00:00Z',
      },
      {
        id: 'pr-2',
        number: 20,
        status: PullRequestStatus.Merged,
        draft: false,
        checkStatus: null,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]);

    expect(result).toEqual({
      number: 20,
      status: PullRequestStatus.Merged,
      draft: false,
      checkStatus: null,
    });
  });

  it('picks most recent open PR when multiple open', () => {
    const result = pickPrimaryPr([
      {
        id: 'pr-1',
        number: 10,
        status: PullRequestStatus.Open,
        draft: false,
        checkStatus: null,
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'pr-2',
        number: 20,
        status: PullRequestStatus.Open,
        draft: true,
        checkStatus: null,
        createdAt: '2024-01-03T00:00:00Z',
      },
    ]);

    expect(result).toEqual({
      number: 20,
      status: PullRequestStatus.Open,
      draft: true,
      checkStatus: null,
    });
  });
});

describe('isCloseable', () => {
  it('returns true when taskStatus is DONE and PR is MERGED', () => {
    expect(
      isCloseable({
        taskId: 't1',
        displayId: 'TSK-1',
        taskTitle: 'Task',
        projectId: 'p1',
        projectName: 'Proj',
        sessionCount: 1,
        sessionIds: ['s1'],
        status: SessionStatus.Running,
        taskStatus: 'DONE',
        pullRequest: {
          number: 1,
          status: PullRequestStatus.Merged,
          draft: false,
          checkStatus: null,
        },
      }),
    ).toBe(true);
  });

  it('returns false when taskStatus is DONE but PR is OPEN', () => {
    expect(
      isCloseable({
        taskId: 't1',
        displayId: 'TSK-1',
        taskTitle: 'Task',
        projectId: 'p1',
        projectName: 'Proj',
        sessionCount: 1,
        sessionIds: ['s1'],
        status: SessionStatus.Running,
        taskStatus: 'DONE',
        pullRequest: {
          number: 1,
          status: PullRequestStatus.Open,
          draft: false,
          checkStatus: null,
        },
      }),
    ).toBe(false);
  });

  it('returns false when PR is MERGED but taskStatus is not DONE', () => {
    expect(
      isCloseable({
        taskId: 't1',
        displayId: 'TSK-1',
        taskTitle: 'Task',
        projectId: 'p1',
        projectName: 'Proj',
        sessionCount: 1,
        sessionIds: ['s1'],
        status: SessionStatus.Running,
        taskStatus: 'IN_PROGRESS',
        pullRequest: {
          number: 1,
          status: PullRequestStatus.Merged,
          draft: false,
          checkStatus: null,
        },
      }),
    ).toBe(false);
  });

  it('returns false when no pullRequest exists', () => {
    expect(
      isCloseable({
        taskId: 't1',
        displayId: 'TSK-1',
        taskTitle: 'Task',
        projectId: 'p1',
        projectName: 'Proj',
        sessionCount: 1,
        sessionIds: ['s1'],
        status: SessionStatus.Running,
        taskStatus: 'DONE',
      }),
    ).toBe(false);
  });
});
