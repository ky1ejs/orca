// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider, Client } from 'urql';
import { never, fromValue } from 'wonka';
import { TaskList } from './TaskList.js';
import { TaskStatus } from '../../graphql/__generated__/generated.js';
import { WorkspaceProvider } from '../../workspace/context.js';

beforeEach(() => {
  (window as unknown as Record<string, unknown>).orca = {
    worktree: {
      get: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

afterEach(cleanup);

const MOCK_WORKSPACE = {
  id: 'ws1',
  name: 'Personal',
  slug: 'personal',
  createdAt: '',
  updatedAt: '',
};

function createMockClient() {
  return {
    executeQuery: vi.fn(({ query }) => {
      const queryStr = typeof query === 'string' ? query : (query?.loc?.source?.body ?? '');
      if (queryStr.includes('query Workspaces')) {
        return fromValue({ data: { workspaces: [MOCK_WORKSPACE] } });
      }
      return never;
    }),
    executeMutation: vi.fn(() => never),
    executeSubscription: vi.fn(() => never),
  } as unknown as Client;
}

describe('TaskList', () => {
  it('renders tasks with status badges', () => {
    const client = createMockClient();
    const tasks = [
      { id: '1', title: 'Fix bug', status: TaskStatus.InProgress },
      { id: '2', title: 'Write tests', status: TaskStatus.Todo },
      { id: '3', title: 'Deploy', status: TaskStatus.Done },
    ];

    render(
      <Provider value={client}>
        <WorkspaceProvider>
          <TaskList projectId="proj-1" tasks={tasks} onTaskClick={vi.fn()} />
        </WorkspaceProvider>
      </Provider>,
    );

    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders empty state when no tasks', () => {
    const client = createMockClient();

    render(
      <Provider value={client}>
        <WorkspaceProvider>
          <TaskList projectId="proj-1" tasks={[]} onTaskClick={vi.fn()} />
        </WorkspaceProvider>
      </Provider>,
    );

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('renders New Task button', () => {
    const client = createMockClient();

    render(
      <Provider value={client}>
        <WorkspaceProvider>
          <TaskList projectId="proj-1" tasks={[]} onTaskClick={vi.fn()} />
        </WorkspaceProvider>
      </Provider>,
    );

    expect(screen.getByRole('button', { name: 'New Task' })).toBeInTheDocument();
  });

  it('calls onTaskClick when a task is clicked', () => {
    const client = createMockClient();
    const onTaskClick = vi.fn();
    const tasks = [{ id: 'task-1', title: 'My task', status: TaskStatus.Todo }];

    render(
      <Provider value={client}>
        <WorkspaceProvider>
          <TaskList projectId="proj-1" tasks={tasks} onTaskClick={onTaskClick} />
        </WorkspaceProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByText('My task'));
    expect(onTaskClick).toHaveBeenCalledWith('task-1');
  });
});
