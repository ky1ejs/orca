// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NavigationProvider, useNavigation } from './context.js';

afterEach(cleanup);

function TestNavigationConsumer() {
  const { current, navigate, goBack, canGoBack } = useNavigation();
  return (
    <div>
      <div data-testid="view">{current.view}</div>
      <div data-testid="id">{current.id ?? 'none'}</div>
      <div data-testid="can-go-back">{canGoBack ? 'yes' : 'no'}</div>
      <button onClick={() => navigate({ view: 'project', id: 'p1' })}>Go to Project</button>
      <button onClick={() => navigate({ view: 'task', id: 't1' })}>Go to Task</button>
      <button onClick={goBack}>Go Back</button>
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
});
