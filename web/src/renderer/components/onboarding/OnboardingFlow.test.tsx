// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider, Client } from 'urql';
import { fromValue, never } from 'wonka';
import { OnboardingFlow } from './OnboardingFlow.js';
import { NavigationProvider } from '../../navigation/context.js';
import { WorkspaceProvider } from '../../workspace/context.js';

afterEach(cleanup);

const MOCK_WORKSPACE = {
  id: 'ws1',
  name: 'Personal',
  slug: 'personal',
  createdAt: '',
  updatedAt: '',
};

function createMockClient(overrides?: { executeMutation?: ReturnType<typeof vi.fn> }) {
  return {
    executeQuery: vi.fn(() => fromValue({ data: { workspaces: [MOCK_WORKSPACE] } })),
    executeMutation: overrides?.executeMutation ?? vi.fn(() => never),
    executeSubscription: vi.fn(() => never),
  } as unknown as Client;
}

function renderWithProviders(client: Client, onComplete = vi.fn()) {
  return render(
    <Provider value={client}>
      <WorkspaceProvider>
        <NavigationProvider>
          <OnboardingFlow onComplete={onComplete} />
        </NavigationProvider>
      </WorkspaceProvider>
    </Provider>,
  );
}

describe('OnboardingFlow', () => {
  it('renders the welcome step initially', () => {
    const client = createMockClient();
    renderWithProviders(client);

    expect(screen.getByTestId('onboarding-welcome')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Orca')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-get-started')).toBeInTheDocument();
  });

  it('shows step indicators', () => {
    const client = createMockClient();
    renderWithProviders(client);

    expect(screen.getByTestId('onboarding-steps')).toBeInTheDocument();
  });

  it('navigates to create project step on Get Started click', () => {
    const client = createMockClient();
    renderWithProviders(client);

    fireEvent.click(screen.getByTestId('onboarding-get-started'));

    expect(screen.getByTestId('onboarding-create-project')).toBeInTheDocument();
    expect(screen.getByText('Create a Project')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-project-name')).toBeInTheDocument();
  });

  it('disables create project button when name is empty', () => {
    const client = createMockClient();
    renderWithProviders(client);

    fireEvent.click(screen.getByTestId('onboarding-get-started'));

    const createBtn = screen.getByTestId('onboarding-create-project-btn');
    expect(createBtn).toBeDisabled();
  });

  it('enables create project button when name is provided', () => {
    const client = createMockClient();
    renderWithProviders(client);

    fireEvent.click(screen.getByTestId('onboarding-get-started'));

    const nameInput = screen.getByTestId('onboarding-project-name');
    fireEvent.change(nameInput, { target: { value: 'My Project' } });

    const createBtn = screen.getByTestId('onboarding-create-project-btn');
    expect(createBtn).not.toBeDisabled();
  });

  it('advances to create task after creating project', async () => {
    const executeMutation = vi.fn(() =>
      fromValue({
        data: {
          createProject: { id: 'proj-1', name: 'My Project' },
        },
      }),
    );
    const client = createMockClient({ executeMutation });
    renderWithProviders(client);

    // Go to create project
    fireEvent.click(screen.getByTestId('onboarding-get-started'));

    // Fill in project name
    fireEvent.change(screen.getByTestId('onboarding-project-name'), {
      target: { value: 'My Project' },
    });

    // Click create
    fireEvent.click(screen.getByTestId('onboarding-create-project-btn'));

    // Should advance to create task step
    expect(await screen.findByTestId('onboarding-create-task')).toBeInTheDocument();
    expect(screen.getByText('Create a Task')).toBeInTheDocument();
  });

  it('advances to launch step after creating task', async () => {
    let callCount = 0;
    const executeMutation = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return fromValue({
          data: { createProject: { id: 'proj-1', name: 'My Project' } },
        });
      }
      return fromValue({
        data: { createTask: { id: 'task-1', title: 'My Task' } },
      });
    });
    const client = createMockClient({ executeMutation });
    renderWithProviders(client);

    // Welcome -> Create Project
    fireEvent.click(screen.getByTestId('onboarding-get-started'));
    fireEvent.change(screen.getByTestId('onboarding-project-name'), {
      target: { value: 'My Project' },
    });
    fireEvent.click(screen.getByTestId('onboarding-create-project-btn'));

    // Create Task
    await screen.findByTestId('onboarding-create-task');
    fireEvent.change(screen.getByTestId('onboarding-task-title'), {
      target: { value: 'My Task' },
    });
    fireEvent.change(screen.getByTestId('onboarding-working-dir'), {
      target: { value: '/tmp/test' },
    });
    fireEvent.click(screen.getByTestId('onboarding-create-task-btn'));

    // Should advance to launch step
    expect(await screen.findByTestId('onboarding-launch-agent')).toBeInTheDocument();
    expect(screen.getByText('You are all set!')).toBeInTheDocument();
  });

  it('calls onComplete when finish is clicked', async () => {
    let callCount = 0;
    const executeMutation = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return fromValue({
          data: { createProject: { id: 'proj-1', name: 'My Project' } },
        });
      }
      return fromValue({
        data: { createTask: { id: 'task-1', title: 'My Task' } },
      });
    });
    const client = createMockClient({ executeMutation });
    const onComplete = vi.fn();
    renderWithProviders(client, onComplete);

    // Navigate through all steps
    fireEvent.click(screen.getByTestId('onboarding-get-started'));
    fireEvent.change(screen.getByTestId('onboarding-project-name'), {
      target: { value: 'Test' },
    });
    fireEvent.click(screen.getByTestId('onboarding-create-project-btn'));
    await screen.findByTestId('onboarding-create-task');
    fireEvent.change(screen.getByTestId('onboarding-task-title'), {
      target: { value: 'Task' },
    });
    fireEvent.change(screen.getByTestId('onboarding-working-dir'), {
      target: { value: '/tmp' },
    });
    fireEvent.click(screen.getByTestId('onboarding-create-task-btn'));
    await screen.findByTestId('onboarding-launch-agent');

    fireEvent.click(screen.getByTestId('onboarding-finish'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
