// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NavigationProvider, useNavigation } from './context.js';

afterEach(cleanup);

function TestNavigationConsumer() {
  const {
    current,
    navigate,
    goToParent,
    canGoToParent,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  } = useNavigation();
  return (
    <div>
      <div data-testid="view">{current.view}</div>
      <div data-testid="id">{current.id ?? 'none'}</div>
      <div data-testid="can-go-to-parent">{canGoToParent ? 'yes' : 'no'}</div>
      <div data-testid="can-go-back">{canGoBack ? 'yes' : 'no'}</div>
      <div data-testid="can-go-forward">{canGoForward ? 'yes' : 'no'}</div>
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
      <button onClick={() => navigate({ view: 'settings' })}>Go to Settings</button>
      <button onClick={goToParent}>Go to Parent</button>
      <button onClick={goBack}>Go Back</button>
      <button onClick={goForward}>Go Forward</button>
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

describe('Navigation history (back/forward)', () => {
  it('canGoBack is false at start', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('no');
  });

  it('canGoBack becomes true after navigating', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Project').click();
    });

    expect(screen.getByTestId('can-go-back')).toHaveTextContent('yes');
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('no');
  });

  it('goBack returns to previous view', () => {
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
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('yes');
  });

  it('goForward returns to next view after goBack', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');

    act(() => {
      screen.getByText('Go Forward').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');
    expect(screen.getByTestId('id')).toHaveTextContent('p1');
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('no');
  });

  it('navigate after goBack clears forward history', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    // Navigate: initiatives -> project -> task
    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go to Task').click();
    });

    // Go back twice to initiatives
    act(() => {
      screen.getByText('Go Back').click();
    });
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('yes');

    // Navigate to settings — forward history should be cleared
    act(() => {
      screen.getByText('Go to Settings').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('settings');
    expect(screen.getByTestId('can-go-forward')).toHaveTextContent('no');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('yes');

    // Going back should return to initiatives, not project
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
  });

  it('goToParent pushes to history (can go back to child)', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go to Task').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('task');

    // Go to parent (task -> project) — this should be recorded in history
    act(() => {
      screen.getByText('Go to Parent').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');

    // Go back should return to task
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('task');
    expect(screen.getByTestId('id')).toHaveTextContent('t1');
  });

  it('navigating to same view+id does not create duplicate history entry', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Project').click();
    });
    // Navigate to same project again
    act(() => {
      screen.getByText('Go to Project').click();
    });

    // Should only have one back step (to initiatives)
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
  });

  it('goBack is a no-op at the start of history', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');
  });

  it('goForward is a no-op at the end of history', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go Forward').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');
  });

  it('supports multi-step back and forward', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    // Navigate: initiatives -> project -> task -> settings
    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go to Task').click();
    });
    act(() => {
      screen.getByText('Go to Settings').click();
    });

    // Go back through all
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('task');

    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');

    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('initiatives');

    // Go forward through all
    act(() => {
      screen.getByText('Go Forward').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');

    act(() => {
      screen.getByText('Go Forward').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('task');

    act(() => {
      screen.getByText('Go Forward').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('settings');
  });
});
