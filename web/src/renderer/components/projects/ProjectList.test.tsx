// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider, Client, CombinedError } from 'urql';
import { fromValue, never } from 'wonka';
import { ProjectList } from './ProjectList.js';
import { NavigationProvider } from '../../navigation/context.js';

afterEach(cleanup);

function createMockClient(result: { data?: unknown; error?: CombinedError }) {
  return {
    executeQuery: vi.fn(() => fromValue(result)),
    executeMutation: vi.fn(() => never),
    executeSubscription: vi.fn(() => never),
  } as unknown as Client;
}

function renderWithProviders(client: Client) {
  return render(
    <Provider value={client}>
      <NavigationProvider>
        <ProjectList />
      </NavigationProvider>
    </Provider>,
  );
}

describe('ProjectList', () => {
  it('renders projects from data', () => {
    const client = createMockClient({
      data: {
        projects: [
          { id: '1', name: 'Project Alpha', description: 'First project', tasks: [] },
          { id: '2', name: 'Project Beta', description: null, tasks: [] },
        ],
      },
    });

    renderWithProviders(client);

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('First project')).toBeInTheDocument();
  });

  it('renders empty state when no projects', () => {
    const client = createMockClient({
      data: { projects: [] },
    });

    renderWithProviders(client);

    expect(screen.getByText('No projects yet. Create one to get started.')).toBeInTheDocument();
  });

  it('renders heading', () => {
    const client = createMockClient({
      data: { projects: [] },
    });

    renderWithProviders(client);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Projects');
  });

  it('renders New Project button', () => {
    const client = createMockClient({
      data: { projects: [] },
    });

    renderWithProviders(client);

    expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument();
  });
});
