// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NavigationProvider, useNavigation } from './context.js';

afterEach(cleanup);

function TestNavigationConsumer() {
  const { current, navigate, goBack, navigateBack, canGoBack } = useNavigation();
  return (
    <div>
      <div data-testid="view">{current.view}</div>
      <div data-testid="id">{current.id ?? 'none'}</div>
      <div data-testid="can-go-back">{canGoBack ? 'yes' : 'no'}</div>
      <button onClick={() => navigate({ view: 'project', id: 'p1' })}>Go to Project</button>
      <button onClick={() => navigate({ view: 'project', id: 'p2' })}>Go to Project 2</button>
      <button onClick={() => navigate({ view: 'task', id: 't1' })}>Go to Task</button>
      <button onClick={goBack}>Go Back</button>
      <button onClick={() => navigateBack({ view: 'projects' })}>Navigate Back Projects</button>
      <button onClick={() => navigateBack({ view: 'project', id: 'p1' })}>
        Navigate Back Project
      </button>
    </div>
  );
}

describe('NavigationProvider', () => {
  it('starts with projects view', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('view')).toHaveTextContent('projects');
    expect(screen.getByTestId('id')).toHaveTextContent('none');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
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
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('yes');
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

  it('goes back to previous view', () => {
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
    expect(screen.getByTestId('view')).toHaveTextContent('projects');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
  });

  it('does not go back past the initial view', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    act(() => {
      screen.getByText('Go Back').click();
    });

    expect(screen.getByTestId('view')).toHaveTextContent('projects');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
  });

  it('maintains navigation stack correctly', () => {
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

    // Go back to project
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');

    // Go back to projects
    act(() => {
      screen.getByText('Go Back').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('projects');
  });

  it('navigateBack truncates stack to matching target', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    // Build stack: projects -> p1 -> p2 -> task
    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go to Project 2').click();
    });
    act(() => {
      screen.getByText('Go to Task').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('task');

    // navigateBack to projects should skip p1 and p2
    act(() => {
      screen.getByText('Navigate Back Projects').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('projects');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
  });

  it('navigateBack truncates stack to matching project', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    // Build stack: projects -> p1 -> p2 -> task
    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Go to Project 2').click();
    });
    act(() => {
      screen.getByText('Go to Task').click();
    });

    // navigateBack to p1 should skip p2 and task
    act(() => {
      screen.getByText('Navigate Back Project').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');
    expect(screen.getByTestId('id')).toHaveTextContent('p1');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('yes');
  });

  it('navigateBack resets stack when target not found', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    // Build stack: projects -> p2 -> task
    act(() => {
      screen.getByText('Go to Project 2').click();
    });
    act(() => {
      screen.getByText('Go to Task').click();
    });

    // navigateBack to p1 (not in stack) should reset to [projects, p1]
    act(() => {
      screen.getByText('Navigate Back Project').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('project');
    expect(screen.getByTestId('id')).toHaveTextContent('p1');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('yes');
  });

  it('navigateBack to projects when not in stack resets to projects root', () => {
    render(
      <NavigationProvider>
        <TestNavigationConsumer />
      </NavigationProvider>,
    );

    // Navigate to project, then navigateBack to projects (which IS in stack)
    act(() => {
      screen.getByText('Go to Project').click();
    });
    act(() => {
      screen.getByText('Navigate Back Projects').click();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('projects');
    expect(screen.getByTestId('can-go-back')).toHaveTextContent('no');
  });
});
