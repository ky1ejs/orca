// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider, Client, CombinedError } from 'urql';
import { fromValue, never } from 'wonka';
import { ProjectList } from './ProjectList.js';
import { NavigationProvider } from '../../navigation/context.js';
import { WorkspaceProvider } from '../../workspace/context.js';
import { WorkspaceDataProvider } from '../../workspace/workspace-data-context.js';

afterEach(cleanup);

const MOCK_WORKSPACE = {
  id: 'ws1',
  name: 'Personal',
  slug: 'personal',
  createdAt: '',
  updatedAt: '',
};

function createMockClient(result: { data?: unknown; error?: CombinedError }) {
  return {
    executeQuery: vi.fn(({ query }) => {
      const queryStr = typeof query === 'string' ? query : (query?.loc?.source?.body ?? '');
      if (queryStr.includes('query Workspaces')) {
        return fromValue({ data: { workspaces: [MOCK_WORKSPACE] } });
      }
      return fromValue(result);
    }),
    executeMutation: vi.fn(() => never),
    executeSubscription: vi.fn(() => never),
  } as unknown as Client;
}

function renderWithProviders(client: Client) {
  return render(
    <Provider value={client}>
      <WorkspaceProvider>
        <WorkspaceDataProvider>
          <NavigationProvider>
            <ProjectList />
          </NavigationProvider>
        </WorkspaceDataProvider>
      </WorkspaceProvider>
    </Provider>,
  );
}

describe('ProjectList', () => {
  it('renders projects from data', () => {
    const client = createMockClient({
      data: {
        workspace: {
          ...MOCK_WORKSPACE,
          projects: [
            { id: '1', name: 'Project Alpha', description: 'First project', tasks: [] },
            { id: '2', name: 'Project Beta', description: null, tasks: [] },
          ],
        },
      },
    });

    renderWithProviders(client);

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('First project')).toBeInTheDocument();
  });

  it('renders empty state when no projects', () => {
    const client = createMockClient({
      data: { workspace: { ...MOCK_WORKSPACE, projects: [] } },
    });

    renderWithProviders(client);

    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });

  it('renders heading', () => {
    const client = createMockClient({
      data: { workspace: { ...MOCK_WORKSPACE, projects: [] } },
    });

    renderWithProviders(client);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Projects');
  });

  it('renders New Project button', () => {
    const client = createMockClient({
      data: { workspace: { ...MOCK_WORKSPACE, projects: [] } },
    });

    renderWithProviders(client);

    expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument();
  });
});
