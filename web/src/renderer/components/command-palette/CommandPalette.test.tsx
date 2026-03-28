// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CommandPalette } from './CommandPalette.js';
import { TaskStatus } from '../../graphql/__generated__/generated.js';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('../../navigation/context.js', () => ({
  useNavigation: () => ({ current: { view: 'initiatives' }, navigate: mockNavigate }),
}));

// Mock workspace context
vi.mock('../../workspace/context.js', () => ({
  useWorkspace: () => ({
    currentWorkspace: { id: 'ws-1', slug: 'test-ws', name: 'Test Workspace' },
  }),
}));

// Mock workspace data context
const mockRefetch = vi.fn();
vi.mock('../../workspace/workspace-data-context.js', () => ({
  useWorkspaceData: () => ({
    workspace: { slug: 'test-ws' },
    error: undefined,
    projects: [
      {
        id: 'p-1',
        name: 'Backend',
        archivedAt: null,
        tasks: [
          {
            id: 't-1',
            displayId: 'ORCA-1',
            title: 'Fix login bug',
            status: TaskStatus.Todo,
          },
          {
            id: 't-2',
            displayId: 'ORCA-2',
            title: 'Add user auth',
            status: TaskStatus.InProgress,
          },
        ],
      },
    ],
    inboxTasks: [
      {
        id: 't-3',
        displayId: 'ORCA-3',
        title: 'Inbox task',
        status: TaskStatus.Todo,
      },
    ],
    initiatives: [
      {
        id: 'i-1',
        name: 'Q1 Goals',
        archivedAt: null,
      },
    ],
    fetching: false,
    refetch: mockRefetch,
  }),
}));

describe('CommandPalette', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onShowQuickCreate: vi.fn(),
    onShowShortcutHelp: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders nothing when closed', () => {
    const { container } = render(<CommandPalette {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders search input when open', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search tasks, projects, actions...')).toBeInTheDocument();
  });

  it('shows category headers when query is empty', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Initiatives')).toBeInTheDocument();
  });

  it('filters results as user types', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search tasks, projects, actions...');
    fireEvent.change(input, { target: { value: 'login' } });
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.queryByText('Add user auth')).not.toBeInTheDocument();
  });

  it('shows "No results" for unmatched queries', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search tasks, projects, actions...');
    fireEvent.change(input, { target: { value: 'xyznonexistent' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search tasks, projects, actions...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    const { container } = render(<CommandPalette {...defaultProps} />);
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('navigates to task on Enter', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search tasks, projects, actions...');
    fireEvent.change(input, { target: { value: 'login' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({
      view: 'task',
      id: 't-1',
      projectId: 'p-1',
      projectName: 'Backend',
      taskName: 'Fix login bug',
    });
  });

  it('triggers quick create for Create Task action', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search tasks, projects, actions...');
    fireEvent.change(input, { target: { value: 'Create Task' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onShowQuickCreate).toHaveBeenCalled();
  });

  it('supports arrow key navigation', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search tasks, projects, actions...');
    fireEvent.change(input, { target: { value: 'ORCA' } });

    // Move down to second item
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const selectedItems = screen
      .getAllByRole('button')
      .filter((b) => b.dataset.selected === 'true');
    expect(selectedItems).toHaveLength(1);
  });

  it('displays task displayId and project name', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByText('ORCA-1')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });

  it('shows keyboard hints in footer', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByText('navigate')).toBeInTheDocument();
    expect(screen.getByText('select')).toBeInTheDocument();
  });

  it('refetches workspace data when opened', () => {
    render(<CommandPalette {...defaultProps} isOpen={true} />);
    expect(mockRefetch).toHaveBeenCalledWith({ requestPolicy: 'network-only' });
  });

  it('does not refetch when closed', () => {
    render(<CommandPalette {...defaultProps} isOpen={false} />);
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
