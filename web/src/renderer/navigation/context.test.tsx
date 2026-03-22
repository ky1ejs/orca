// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NavigationProvider, useNavigation } from './context.js';

afterEach(cleanup);

function TestNavigationConsumer() {
  const { current, navigate, goToParent, canGoToParent } = useNavigation();
  return (
    <div>
      <div data-testid="view">{current.view}</div>
      <div data-testid="id">{current.id ?? 'none'}</div>
      <div data-testid="can-go-to-parent">{canGoToParent ? 'yes' : 'no'}</div>
      <button onClick={() => navigate({ view: 'project', id: 'p1', projectName: 'Project One' })}>
        Go to Project
      </button>
      <button
        onClick={() =>
          navigate({
            view: 'task',
            id: 't1',
            projectId: 'p1',
            projectName: 'Project One',
            taskName: 'Task One',
          })
        }
      >
        Go to Task
      </button>
      <button onClick={() => navigate({ view: 'my-tasks' })}>Go to My Tasks</button>
      <button
        onClick={() =>
          navigate({
            view: 'task',
            id: 't2',
            projectId: 'p1',
            projectName: 'Project One',
            taskName: 'Task Two',
            fromView: 'my-tasks',
          })
        }
      >
        Go to Task from My Tasks
      </button>
      <button onClick={goToParent}>Go to Parent</button>
    </div>
  );
}

describe('NavigationProvider', () => {
  it('starts with initiatives view', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
    expect(screen.getByTestId('id')).toHaveTextContent('none');
    expect(screen.getByTestId('can-go-to-parent')).toHaveTextContent('no');
  });

  it('navigates to a project view', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Project').click();
    });

    expect(screen.getByTestId('view')).toHaveTextContent('project');
    expect(screen.getByTestId('id')).toHaveTextContent('p1');
    expect(screen.getByTestId('can-go-to-parent')).toHaveTextContent('yes');
  });

  it('navigates to a task view', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Task').click();
    });

    expect(screen.getByTestId('view')).toHaveTextContent('task');
    expect(screen.getByTestId('id')).toHaveTextContent('t1');
  });

  it('goes to parent view from project', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Project').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');

    act(() => {
      screen.getByText('Go to Parent').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
    expect(screen.getByTestId('can-go-to-parent')).toHaveTextContent('no');
  });

  it('does not go to parent past the initial view', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Parent').click();
    });

    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
    expect(screen.getByTestId('can-go-to-parent')).toHaveTextContent('no');
  });

  it('navigates up the hierarchy correctly', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    // Navigate: projects -> project -> task
    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go to Task').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('task');

    // Go to parent (task -> project)
    act(() => {
      screen.getByText('Go to Parent').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');
    expect(screen.getByTestId('id')).toHaveTextContent('p1');

    // Go to parent (project -> projects)
    act(() => {
      screen.getByText('Go to Parent').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
  });

  it('navigates to my-tasks view', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to My Tasks').click();
    });

    expect(screen.getByTestId('view')).toHaveTextContent('my-tasks');
    expect(screen.getByTestId('can-go-to-parent')).toHaveTextContent('no');
  });

  it('goes to my-tasks from task with fromView', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Task from My Tasks').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('task');
    expect(screen.getByTestId('can-go-to-parent')).toHaveTextContent('yes');

    act(() => {
      screen.getByText('Go to Parent').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('my-tasks');
    expect(screen.getByTestId('can-go-to-parent')).toHaveTextContent('no');
  });
});
