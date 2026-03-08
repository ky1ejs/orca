// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TaskTable } from './TaskTable.js';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';

// Mock useCreateTask
vi.mock('../../hooks/useGraphQL.js', () => ({
  useCreateTask: () => ({ createTask: vi.fn() }),
}));

const mockTasks = [
  {
    id: '1',
    title: 'In progress task',
    displayId: 'TST-1',
    status: TaskStatus.InProgress,
    priority: TaskPriority.High,
    assignee: { id: 'u1', name: 'Alice' },
    labels: [{ id: 'l1', name: 'Bug', color: '#FF0000' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-05T00:00:00Z',
  },
  {
    id: '2',
    title: 'Todo task',
    displayId: 'TST-2',
    status: TaskStatus.Todo,
    priority: TaskPriority.None,
    assignee: null,
    labels: [],
    createdAt: '2026-02-28T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
  {
    id: '3',
    title: 'Done task',
    displayId: 'TST-3',
    status: TaskStatus.Done,
    priority: TaskPriority.Low,
    assignee: null,
    labels: [],
    createdAt: '2026-02-15T00:00:00Z',
    updatedAt: '2026-02-20T00:00:00Z',
  },
  {
    id: '4',
    title: 'Review task',
    displayId: 'TST-4',
    status: TaskStatus.InReview,
    priority: TaskPriority.Medium,
    assignee: null,
    labels: [{ id: 'l2', name: 'Feature', color: '#00FF00' }],
    createdAt: '2026-03-02T00:00:00Z',
    updatedAt: '2026-03-06T00:00:00Z',
  },
];

afterEach(cleanup);

describe('TaskTable', () => {
  it('renders all status groups', () => {
    render(<TaskTable projectId="p1" tasks={mockTasks} onTaskClick={vi.fn()} />);
    expect(screen.getByText('In Progress')).toBeTruthy();
    expect(screen.getByText('In Review')).toBeTruthy();
    expect(screen.getByText('Todo')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('renders task titles', () => {
    render(<TaskTable projectId="p1" tasks={mockTasks} onTaskClick={vi.fn()} />);
    expect(screen.getByText('In progress task')).toBeTruthy();
    expect(screen.getByText('Todo task')).toBeTruthy();
    expect(screen.getByText('Review task')).toBeTruthy();
  });

  it('shows task counts in group headers', () => {
    render(<TaskTable projectId="p1" tasks={mockTasks} onTaskClick={vi.fn()} />);
    // Each group has 1 task, and there are also empty groups showing 0
    const counts = screen.getAllByText('1');
    expect(counts.length).toBeGreaterThanOrEqual(4);
  });

  it('shows empty groups with count 0', () => {
    const tasks = [mockTasks[0]]; // Only In Progress
    render(<TaskTable projectId="p1" tasks={tasks} onTaskClick={vi.fn()} />);
    expect(screen.getByText('In Review')).toBeTruthy();
    expect(screen.getByText('Todo')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('collapses Done group by default', () => {
    render(<TaskTable projectId="p1" tasks={mockTasks} onTaskClick={vi.fn()} />);
    const doneHeader = screen.getByText('Done').closest('[role="row"]');
    expect(doneHeader?.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles group collapse on header click', () => {
    render(<TaskTable projectId="p1" tasks={mockTasks} onTaskClick={vi.fn()} />);
    const doneHeader = screen.getByText('Done').closest('[role="row"]');
    expect(doneHeader?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(doneHeader!);
    expect(doneHeader?.getAttribute('aria-expanded')).toBe('true');
  });

  it('calls onTaskClick when a task row is clicked', () => {
    const handler = vi.fn();
    render(<TaskTable projectId="p1" tasks={mockTasks} onTaskClick={handler} />);
    fireEvent.click(screen.getByText('In progress task'));
    expect(handler).toHaveBeenCalledWith('1');
  });

  it('has a grid role with aria-label', () => {
    const { container } = render(
      <TaskTable projectId="p1" tasks={mockTasks} onTaskClick={vi.fn()} />,
    );
    const grid = container.querySelector('[role="grid"]');
    expect(grid).toBeTruthy();
    expect(grid?.getAttribute('aria-label')).toBe('Tasks');
  });

  it('focuses first task on table focus', () => {
    const { container } = render(
      <TaskTable projectId="p1" tasks={mockTasks} onTaskClick={vi.fn()} />,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    fireEvent.focus(grid);

    const selectedRow = container.querySelector('[aria-selected="true"]');
    expect(selectedRow).toBeTruthy();
  });

  it('opens task on Enter key', () => {
    const handler = vi.fn();
    const { container } = render(
      <TaskTable projectId="p1" tasks={mockTasks} onTaskClick={handler} />,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    fireEvent.focus(grid);
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(handler).toHaveBeenCalled();
  });

  it('shows empty state when no tasks', () => {
    render(<TaskTable projectId="p1" tasks={[]} onTaskClick={vi.fn()} />);
    expect(screen.getByText('No tasks yet')).toBeTruthy();
  });
});
