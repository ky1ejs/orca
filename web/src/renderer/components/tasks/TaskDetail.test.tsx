// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import { SessionStatus } from '../../../shared/session-status.js';

const mockUpdateTask = vi.fn().mockResolvedValue({});
const mockDeleteTask = vi.fn().mockResolvedValue({});
const mockRefreshSessions = vi.fn();
const mockGoToParent = vi.fn();
const mockNavigate = vi.fn();
const mockUpdateDirectory = vi.fn();
const mockAgentStop = vi.fn().mockResolvedValue(undefined);

let mockSessions: { id: string; status: SessionStatus }[] = [];
let mockTask: {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  displayId: string;
  project: { name: string };
  assignee: { id: string; name: string; email: string } | null;
  labels: { id: string; name: string; color: string }[];
} | null = null;

vi.mock('../../hooks/useGraphQL.js', () => ({
  useTask: () => ({
    data: mockTask ? { task: mockTask } : null,
    fetching: false,
    error: null,
  }),
  useUpdateTask: () => ({ updateTask: mockUpdateTask }),
  useDeleteTask: () => ({ deleteTask: mockDeleteTask }),
  useTaskSubscription: vi.fn(),
  useWorkspaceBySlug: () => ({
    data: {
      workspace: {
        projects: [
          { id: 'proj-1', name: 'Test Project' },
          { id: 'proj-2', name: 'Other Project' },
        ],
      },
    },
    fetching: false,
  }),
  useWorkspaceMembers: () => ({
    data: {
      workspace: {
        members: [
          { user: { id: 'u1', name: 'Alice', email: 'alice@test.com' }, role: 'OWNER' },
          { user: { id: 'u2', name: 'Bob', email: 'bob@test.com' }, role: 'MEMBER' },
        ],
      },
    },
    fetching: false,
  }),
  useLabels: () => ({
    data: { labels: [{ id: 'l1', name: 'Bug', color: '#FF0000', workspaceId: 'ws-1' }] },
    fetching: false,
  }),
}));

vi.mock('../../navigation/context.js', () => ({
  useNavigation: () => ({ goToParent: mockGoToParent, navigate: mockNavigate }),
}));

vi.mock('../../workspace/context.js', () => ({
  useWorkspace: () => ({ currentWorkspace: { id: 'ws-1', slug: 'test-ws' } }),
}));

vi.mock('../../hooks/useProjectDirectory.js', () => ({
  useProjectDirectory: () => ({
    directory: '/tmp/project',
    loading: false,
    updateDirectory: mockUpdateDirectory,
  }),
}));

vi.mock('../../hooks/useTerminalSessions.js', () => ({
  useTerminalSessions: () => ({
    sessions: mockSessions,
    loading: false,
    refresh: mockRefreshSessions,
  }),
}));

vi.mock('../../hooks/useSessionActivity.js', () => ({
  useSessionActivity: () => new Set<string>(),
}));

vi.mock('../terminal/AgentStatus.js', () => ({
  AgentStatus: ({ status }: { status: string }) => (
    <span data-testid="agent-status">{status}</span>
  ),
}));

vi.mock('../markdown/MarkdownRenderer.js', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../layout/Skeleton.js', () => ({
  TaskDetailSkeleton: () => <div data-testid="skeleton">Loading...</div>,
}));

vi.mock('../labels/LabelBadge.js', () => ({
  LabelBadge: () => null,
}));

vi.mock('../labels/LabelPicker.js', () => ({
  LabelPicker: () => null,
}));

// Mock window.orca
(window as unknown as Record<string, unknown>).orca = {
  agent: {
    launch: vi.fn().mockResolvedValue({ success: true }),
    stop: mockAgentStop,
    restart: vi.fn().mockResolvedValue({ success: true }),
    status: vi.fn(),
  },
};

beforeEach(() => {
  mockTask = {
    id: 'task-1',
    title: 'Test Task',
    description: 'A test description',
    status: TaskStatus.InProgress,
    priority: TaskPriority.Medium,
    projectId: 'proj-1',
    displayId: 'TST-1',
    project: { name: 'Test Project' },
    assignee: null,
    labels: [],
  };
  mockSessions = [];
  vi.clearAllMocks();
});

afterEach(cleanup);

// Dynamic import to pick up the mocks
async function importAndRender(taskId = 'task-1') {
  const { TaskDetail } = await import('./TaskDetail.js');
  return render(<TaskDetail taskId={taskId} />);
}

describe('TaskDetail', () => {
  describe('back navigation', () => {
    it('no inline back button (breadcrumbs handle navigation)', async () => {
      await importAndRender();

      expect(screen.queryByText(/Back to Test Project/)).not.toBeInTheDocument();
    });

    it('delete calls goToParent', async () => {
      await importAndRender();

      fireEvent.click(screen.getByText('Delete'));

      await vi.waitFor(() => {
        expect(mockDeleteTask).toHaveBeenCalledWith('task-1');
        expect(mockGoToParent).toHaveBeenCalled();
      });
    });
  });
});
