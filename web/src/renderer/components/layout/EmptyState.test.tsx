// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EmptyState, EmptyProjectList, EmptyTaskList, EmptyTerminalArea } from './EmptyState.js';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No items" description="There are no items here." />);

    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('There are no items here.')).toBeInTheDocument();
  });

  it('renders with action button', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No items"
        description="There are no items here."
        action={<button onClick={onClick}>Add Item</button>}
      />,
    );

    const button = screen.getByRole('button', { name: 'Add Item' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders with icon', () => {
    render(
      <EmptyState
        icon={<span data-testid="test-icon">icon</span>}
        title="No items"
        description="There are no items here."
      />,
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('has the empty-state test id', () => {
    render(<EmptyState title="No items" description="There are no items here." />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});

describe('EmptyProjectList', () => {
  it('renders project empty state with create button', () => {
    const onCreateProject = vi.fn();
    render(<EmptyProjectList onCreateProject={onCreateProject} />);

    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByTestId('create-first-project')).toBeInTheDocument();
  });

  it('calls onCreateProject when button is clicked', () => {
    const onCreateProject = vi.fn();
    render(<EmptyProjectList onCreateProject={onCreateProject} />);

    fireEvent.click(screen.getByTestId('create-first-project'));
    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyTaskList', () => {
  it('renders task empty state with create button', () => {
    const onCreateTask = vi.fn();
    render(<EmptyTaskList onCreateTask={onCreateTask} />);

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.getByTestId('create-first-task')).toBeInTheDocument();
  });

  it('calls onCreateTask when button is clicked', () => {
    const onCreateTask = vi.fn();
    render(<EmptyTaskList onCreateTask={onCreateTask} />);

    fireEvent.click(screen.getByTestId('create-first-task'));
    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyTerminalArea', () => {
  it('renders terminal empty state', () => {
    render(<EmptyTerminalArea />);

    expect(screen.getByText('No active terminals')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});
