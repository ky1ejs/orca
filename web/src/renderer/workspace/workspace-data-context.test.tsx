// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider, Client } from 'urql';
import { fromValue, never } from 'wonka';
import { WorkspaceProvider } from './context.js';
import { WorkspaceDataProvider, useWorkspaceData } from './workspace-data-context.js';
import { TaskStatus, TaskPriority } from '../graphql/__generated__/generated.js';

afterEach(cleanup);

const MOCK_WORKSPACE = {
  id: 'ws-1',
  name: 'Test',
  slug: 'test',
  role: 'OWNER',
  createdAt: '',
  updatedAt: '',
};

const MOCK_PROJECT = {
  id: 'p-1',
  name: 'Backend',
  description: null,
  defaultDirectory: null,
  initiativeId: null,
  archivedAt: null,
  createdAt: '',
  updatedAt: '',
  tasks: [
    {
      id: 't-1',
      displayId: 'ORCA-1',
      title: 'Fix bug',
      status: TaskStatus.Todo,
      priority: TaskPriority.Medium,
      pullRequestCount: 0,
      assignee: null,
      labels: [],
      pullRequests: [],
    },
  ],
};

const MOCK_INITIATIVE = {
  id: 'i-1',
  name: 'Q1 Goals',
  description: null,
  archivedAt: null,
  createdAt: '',
  updatedAt: '',
  projects: [],
};

const MOCK_INBOX_TASK = {
  id: 't-2',
  displayId: 'ORCA-2',
  title: 'Inbox task',
  status: TaskStatus.Todo,
  priority: TaskPriority.None,
  pullRequestCount: 0,
  assignee: null,
  labels: [],
  pullRequests: [],
};

function createMockClient(workspaceData?: {
  projects?: unknown[];
  initiatives?: unknown[];
  tasks?: unknown[];
}) {
  return {
    executeQuery: vi.fn(({ query }) => {
      const queryStr = typeof query === 'string' ? query : (query?.loc?.source?.body ?? '');
      if (queryStr.includes('query Workspaces')) {
        return fromValue({ data: { workspaces: [MOCK_WORKSPACE] } });
      }
      if (queryStr.includes('query Workspace')) {
        return fromValue({
          data: {
            workspace: {
              ...MOCK_WORKSPACE,
              projects: workspaceData?.projects ?? [],
              initiatives: workspaceData?.initiatives ?? [],
              tasks: workspaceData?.tasks ?? [],
            },
          },
        });
      }
      return fromValue({ data: null });
    }),
    executeMutation: vi.fn(() => never),
    executeSubscription: vi.fn(() => never),
  } as unknown as Client;
}

function TestConsumer() {
  const { workspace, projects, initiatives, inboxTasks, fetching, error } = useWorkspaceData();
  return (
    <div>
      <div data-testid="has-workspace">{workspace ? 'yes' : 'no'}</div>
      <div data-testid="has-error">{error ? error.message : 'none'}</div>
      <div data-testid="project-count">{projects.length}</div>
      <div data-testid="initiative-count">{initiatives.length}</div>
      <div data-testid="inbox-count">{inboxTasks.length}</div>
      <div data-testid="fetching">{fetching ? 'yes' : 'no'}</div>
      {projects.map((p) => (
        <div key={p.id} data-testid={`project-${p.id}`}>
          {p.name}
        </div>
      ))}
      {initiatives.map((i) => (
        <div key={i.id} data-testid={`initiative-${i.id}`}>
          {i.name}
        </div>
      ))}
      {inboxTasks.map((t) => (
        <div key={t.id} data-testid={`inbox-${t.id}`}>
          {t.title}
        </div>
      ))}
    </div>
  );
}

function renderWithProviders(client: Client) {
  return render(
    <Provider value={client}>
      <WorkspaceProvider>
        <WorkspaceDataProvider>
          <TestConsumer />
        </WorkspaceDataProvider>
      </WorkspaceProvider>
    </Provider>,
  );
}

describe('WorkspaceDataProvider', () => {
  it('provides workspace data to consumers', () => {
    const client = createMockClient({
      projects: [MOCK_PROJECT],
      initiatives: [MOCK_INITIATIVE],
      tasks: [MOCK_INBOX_TASK],
    });

    renderWithProviders(client);

    expect(screen.getByTestId('has-workspace')).toHaveTextContent('yes');
    expect(screen.getByTestId('project-count')).toHaveTextContent('1');
    expect(screen.getByTestId('initiative-count')).toHaveTextContent('1');
    expect(screen.getByTestId('inbox-count')).toHaveTextContent('1');
    expect(screen.getByTestId('project-p-1')).toHaveTextContent('Backend');
    expect(screen.getByTestId('initiative-i-1')).toHaveTextContent('Q1 Goals');
    expect(screen.getByTestId('inbox-t-2')).toHaveTextContent('Inbox task');
  });

  it('provides empty arrays when workspace has no data', () => {
    const client = createMockClient({
      projects: [],
      initiatives: [],
      tasks: [],
    });

    renderWithProviders(client);

    expect(screen.getByTestId('has-workspace')).toHaveTextContent('yes');
    expect(screen.getByTestId('project-count')).toHaveTextContent('0');
    expect(screen.getByTestId('initiative-count')).toHaveTextContent('0');
    expect(screen.getByTestId('inbox-count')).toHaveTextContent('0');
  });

  it('registers subscriptions via executeSubscription', () => {
    const client = createMockClient({ projects: [MOCK_PROJECT] });

    renderWithProviders(client);

    // WorkspaceDataProvider registers 3 subscriptions (initiative, project, task)
    expect(client.executeSubscription).toHaveBeenCalledTimes(3);
  });

  it('throws when useWorkspaceData is used outside provider', () => {
    // Suppress React error boundary console noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useWorkspaceData must be used within a WorkspaceDataProvider');

    spy.mockRestore();
  });
});
