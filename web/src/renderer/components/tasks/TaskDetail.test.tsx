// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import { SessionStatus } from '../../../shared/session-status.js';

const mockUpdateTask = vi.fn().mockResolvedValue({});
const mockDeleteTask = vi.fn().mockResolvedValue({});
const mockRefreshSessions = vi.fn();
const mockGoBack = vi.fn();
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
}));

vi.mock('../../navigation/context.js', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));

vi.mock('../../workspace/context.js', () => ({
  useWorkspace: () => ({ currentWorkspace: { id: 'ws-1' } }),
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

vi.mock('../terminal/AgentStatus.js', () => ({
  AgentStatus: ({ status }: { status: string }) => <span data-testid="agent-status">{status}</span>,
}));

vi.mock('../markdown/MarkdownRenderer.js', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../layout/Skeleton.js', () => ({
  TaskDetailSkeleton: () => <div data-testid="skeleton">Loading...</div>,
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
  describe('Close Terminal button', () => {
    it('shows Close Terminal button when session is active', async () => {
      mockSessions = [{ id: 'sess-1', status: SessionStatus.Running }];
      await importAndRender();

      expect(screen.getByTestId('close-terminal-button')).toBeInTheDocument();
      expect(screen.getByTestId('close-terminal-button')).toHaveTextContent('Close Terminal');
    });

    it('does not show Close Terminal button when no active session', async () => {
      mockSessions = [];
      await importAndRender();

      expect(screen.queryByTestId('close-terminal-button')).not.toBeInTheDocument();
    });

    it('does not show Close Terminal button when session is exited', async () => {
      mockSessions = [{ id: 'sess-1', status: SessionStatus.Exited }];
      await importAndRender();

      expect(screen.queryByTestId('close-terminal-button')).not.toBeInTheDocument();
    });

    it('calls agent.stop with correct session ID when clicked', async () => {
      mockSessions = [{ id: 'sess-42', status: SessionStatus.Running }];
      await importAndRender();

      fireEvent.click(screen.getByTestId('close-terminal-button'));

      expect(mockAgentStop).toHaveBeenCalledWith('sess-42');
    });

    it('calls refreshSessions after stopping', async () => {
      mockSessions = [{ id: 'sess-1', status: SessionStatus.Running }];
      await importAndRender();

      await fireEvent.click(screen.getByTestId('close-terminal-button'));

      await vi.waitFor(() => {
        expect(mockRefreshSessions).toHaveBeenCalled();
      });
    });
  });

  describe('auto-close on status change to Done', () => {
    it('calls agent.stop when status changes to Done with active session', async () => {
      mockSessions = [{ id: 'sess-1', status: SessionStatus.Running }];
      await importAndRender();

      const statusSelect = screen.getAllByDisplayValue('In Progress')[0];
      fireEvent.change(statusSelect, { target: { value: TaskStatus.Done } });

      await vi.waitFor(() => {
        expect(mockAgentStop).toHaveBeenCalledWith('sess-1');
      });
    });

    it('does not call agent.stop when status changes to non-Done', async () => {
      mockSessions = [{ id: 'sess-1', status: SessionStatus.Running }];
      await importAndRender();

      const statusSelect = screen.getAllByDisplayValue('In Progress')[0];
      fireEvent.change(statusSelect, { target: { value: TaskStatus.InReview } });

      await vi.waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalled();
      });

      expect(mockAgentStop).not.toHaveBeenCalled();
    });

    it('does not call agent.stop when status changes to Done without active session', async () => {
      mockSessions = [];
      await importAndRender();

      const statusSelect = screen.getAllByDisplayValue('In Progress')[0];
      fireEvent.change(statusSelect, { target: { value: TaskStatus.Done } });

      await vi.waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalled();
      });

      expect(mockAgentStop).not.toHaveBeenCalled();
    });
  });
});
