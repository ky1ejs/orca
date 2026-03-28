// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import { SessionStatus } from '../../../shared/session-status.js';

const mockUpdateTask = vi.fn().mockResolvedValue({});
const mockArchiveTask = vi.fn().mockResolvedValue({});
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
let mockFetching = false;
let mockError: { message: string } | null = null;

vi.mock('../../hooks/useGraphQL.js', () => ({
  useTask: () => ({
    data: mockTask ? { task: mockTask } : null,
    fetching: mockFetching,
    error: mockError,
    refetch: vi.fn(),
  }),
  useUpdateTask: () => ({ updateTask: mockUpdateTask }),
  useArchiveTask: () => ({ archiveTask: mockArchiveTask }),
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
  useLinkPullRequest: () => ({
    linkPullRequest: vi.fn(),
    fetching: false,
  }),
  useUnlinkPullRequest: () => ({
    unlinkPullRequest: vi.fn(),
    fetching: false,
  }),
  useCreateTaskRelationship: () => ({
    createTaskRelationship: vi.fn(),
    fetching: false,
  }),
  useRemoveTaskRelationship: () => ({
    removeTaskRelationship: vi.fn(),
    fetching: false,
  }),
  useTaskActivity: () => ({
    data: null,
    fetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../navigation/context.js', () => ({
  useNavigation: () => ({ goToParent: mockGoToParent, navigate: mockNavigate }),
}));

vi.mock('../../workspace/context.js', () => ({
  useWorkspace: () => ({ currentWorkspace: { id: 'ws-1', slug: 'test-ws' } }),
}));

vi.mock('../../workspace/workspace-data-context.js', () => ({
  useWorkspaceData: () => ({
    workspace: undefined,
    projects: [
      { id: 'proj-1', name: 'Test Project' },
      { id: 'proj-2', name: 'Other Project' },
    ],
    initiatives: [],
    inboxTasks: [],
    fetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../hooks/useProjectDirectory.js', () => ({
  useProjectDirectory: () => ({
    directory: '/tmp/project',
    loading: false,
    updateDirectory: mockUpdateDirectory,
  }),
}));

// No longer mock useTerminalSessions — sessions are now passed as props

vi.mock('../../hooks/useSessionActivity.js', () => ({
  useSessionActivity: () => new Set<string>(),
}));

vi.mock('../terminal/AgentStatus.js', () => ({
  AgentStatus: ({ status }: { status: string }) => <span data-testid="agent-status">{status}</span>,
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

vi.mock('./TaskRelationshipList.js', () => ({
  TaskRelationshipList: () => null,
}));

// Mock window.orca
(window as unknown as Record<string, unknown>).orca = {
  agent: {
    launch: vi.fn().mockResolvedValue({ success: true }),
    stop: mockAgentStop,
    restart: vi.fn().mockResolvedValue({ success: true }),
    status: vi.fn(),
  },
  settings: {
    getAll: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
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
  mockFetching = false;
  mockError = null;
  vi.clearAllMocks();
});

afterEach(cleanup);

// Dynamic import to pick up the mocks
async function importAndRender(taskId = 'task-1') {
  const { TaskDetail } = await import('./TaskDetail.js');
  const { PreferencesProvider } = await import('../../preferences/context.js');
  return render(
    <PreferencesProvider>
      <TaskDetail taskId={taskId} sessions={mockSessions} refreshSessions={mockRefreshSessions} />
    </PreferencesProvider>,
  );
}

describe('TaskDetail', () => {
  describe('rendering', () => {
    it('renders task content immediately when data is available', async () => {
      await importAndRender();

      expect(screen.getByText('Test Task')).toBeInTheDocument();
      expect(screen.getByText('TST-1')).toBeInTheDocument();
      expect(screen.getByText('A test description')).toBeInTheDocument();
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    it('shows skeleton when fetching with no prior data', async () => {
      mockTask = null;
      mockFetching = true;

      await importAndRender();

      expect(screen.getByTestId('skeleton')).toBeInTheDocument();
      expect(screen.queryByText('Test Task')).not.toBeInTheDocument();
    });

    it('keeps showing task while refetching (no loading flash)', async () => {
      mockFetching = true;

      await importAndRender();

      expect(screen.getByText('Test Task')).toBeInTheDocument();
      expect(screen.getByText('TST-1')).toBeInTheDocument();
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    it('renders error state', async () => {
      mockTask = null;
      mockError = { message: 'Network failure' };

      await importAndRender();

      expect(screen.getByText(/Network failure/)).toBeInTheDocument();
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    it('renders "Task not found" when data is absent and not fetching', async () => {
      mockTask = null;

      await importAndRender();

      expect(screen.getByText('Task not found.')).toBeInTheDocument();
    });
  });

  describe('task fields', () => {
    it('renders project selector with workspace projects', async () => {
      await importAndRender();

      const projectSelect = screen.getByDisplayValue('Test Project');
      expect(projectSelect).toBeInTheDocument();
      expect(screen.getByText('Other Project')).toBeInTheDocument();
      expect(screen.getByText('Inbox (no project)')).toBeInTheDocument();
    });

    it('renders assignee selector with workspace members', async () => {
      await importAndRender();

      const assigneeSelect = screen.getByTestId('assignee-select');
      expect(assigneeSelect).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    it('renders description with MarkdownRenderer', async () => {
      await importAndRender();

      expect(screen.getByText('A test description')).toBeInTheDocument();
    });

    it('does not render description section when absent', async () => {
      mockTask!.description = null;

      await importAndRender();

      expect(screen.queryByText('Description:')).not.toBeInTheDocument();
    });
  });

  describe('back navigation', () => {
    it('no inline back button (breadcrumbs handle navigation)', async () => {
      await importAndRender();

      expect(screen.queryByText(/Back to Test Project/)).not.toBeInTheDocument();
    });

    it('delete calls goToParent', async () => {
      await importAndRender();

      fireEvent.click(screen.getByText('Delete'));

      await vi.waitFor(() => {
        expect(mockArchiveTask).toHaveBeenCalledWith('task-1');
        expect(mockGoToParent).toHaveBeenCalled();
      });
    });
  });
});
