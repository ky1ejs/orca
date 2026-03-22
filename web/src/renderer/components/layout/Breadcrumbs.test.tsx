// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockNavigate = vi.fn();
const mockGoToParent = vi.fn();
let mockCurrent = { view: 'projects' as const };
let mockCanGoToParent = false;

vi.mock('../../navigation/context.js', () => ({
  useNavigation: () => ({
    current: mockCurrent,
    navigate: mockNavigate,
    goToParent: mockGoToParent,
    canGoToParent: mockCanGoToParent,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockCurrent = { view: 'projects' as const };
  mockCanGoToParent = false;
});

async function importAndRender() {
  const { Breadcrumbs } = await import('./Breadcrumbs.js');
  return render(<Breadcrumbs />);
}

describe('Breadcrumbs', () => {
  it('renders "Projects" (non-clickable) on projects view', async () => {
    mockCurrent = { view: 'projects' };
    mockCanGoToParent = false;
    await importAndRender();

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Projects').tagName).toBe('SPAN');
    expect(screen.getByText('Projects')).toHaveAttribute('aria-current', 'page');
  });

  it('renders "Projects › Project Name" on project view with clickable Projects', async () => {
    mockCurrent = { view: 'project', id: 'p1', projectName: 'My Project' };
    mockCanGoToParent = true;
    await importAndRender();

    const projectsButton = screen.getByText('Projects');
    expect(projectsButton.tagName).toBe('BUTTON');

    const projectName = screen.getByText('My Project');
    expect(projectName.tagName).toBe('SPAN');
    expect(projectName).toHaveAttribute('aria-current', 'page');

    fireEvent.click(projectsButton);
    expect(mockNavigate).toHaveBeenCalledWith({ view: 'projects' });
  });

  it('renders full breadcrumb trail on task view with clickable ancestors', async () => {
    mockCurrent = {
      view: 'task',
      id: 't1',
      projectId: 'p1',
      projectName: 'My Project',
      taskName: 'Fix Bug',
    };
    mockCanGoToParent = true;
    await importAndRender();

    const projectsButton = screen.getByText('Projects');
    expect(projectsButton.tagName).toBe('BUTTON');

    const projectButton = screen.getByText('My Project');
    expect(projectButton.tagName).toBe('BUTTON');

    const taskName = screen.getByText('Fix Bug');
    expect(taskName.tagName).toBe('SPAN');
    expect(taskName).toHaveAttribute('aria-current', 'page');

    fireEvent.click(projectButton);
    expect(mockNavigate).toHaveBeenCalledWith({
      view: 'project',
      id: 'p1',
      projectName: 'My Project',
    });
  });

  it('renders "Settings" on settings view', async () => {
    mockCurrent = { view: 'settings' };
    mockCanGoToParent = false;
    await importAndRender();

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Settings').tagName).toBe('SPAN');
  });

  it('renders "Settings" on members view', async () => {
    mockCurrent = { view: 'members' };
    mockCanGoToParent = false;
    await importAndRender();

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('hides back arrow on root pages', async () => {
    mockCurrent = { view: 'projects' };
    mockCanGoToParent = false;
    await importAndRender();

    expect(screen.queryByLabelText('Go to parent')).not.toBeInTheDocument();
  });

  it('shows back arrow on project view', async () => {
    mockCurrent = { view: 'project', id: 'p1', projectName: 'My Project' };
    mockCanGoToParent = true;
    await importAndRender();

    const backButton = screen.getByLabelText('Go to parent');
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(mockGoToParent).toHaveBeenCalled();
  });

  it('shows back arrow on task view', async () => {
    mockCurrent = {
      view: 'task',
      id: 't1',
      projectId: 'p1',
      projectName: 'My Project',
      taskName: 'Fix Bug',
    };
    mockCanGoToParent = true;
    await importAndRender();

    expect(screen.getByLabelText('Go to parent')).toBeInTheDocument();
  });

  it('skips project segment when task has no projectId', async () => {
    mockCurrent = { view: 'task', id: 't1', taskName: 'Inbox Task' };
    mockCanGoToParent = true;
    await importAndRender();

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Inbox Task')).toBeInTheDocument();
    expect(screen.queryByText('Project')).not.toBeInTheDocument();
  });

  it('uses fallback labels when names are missing', async () => {
    mockCurrent = { view: 'project', id: 'p1' };
    mockCanGoToParent = true;
    await importAndRender();

    expect(screen.getByText('Project')).toBeInTheDocument();
  });

  it('has correct aria-label on nav element', async () => {
    await importAndRender();

    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
  });

  it('renders "My Tasks" on my-tasks view', async () => {
    mockCurrent = { view: 'my-tasks' };
    mockCanGoToParent = false;
    await importAndRender();

    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByText('My Tasks').tagName).toBe('SPAN');
    expect(screen.getByText('My Tasks')).toHaveAttribute('aria-current', 'page');
  });

  it('renders "My Tasks" breadcrumb trail when task has fromView my-tasks', async () => {
    mockCurrent = {
      view: 'task',
      id: 't1',
      projectId: 'p1',
      projectName: 'My Project',
      taskName: 'Fix Bug',
      fromView: 'my-tasks',
    };
    mockCanGoToParent = true;
    await importAndRender();

    const myTasksButton = screen.getByText('My Tasks');
    expect(myTasksButton.tagName).toBe('BUTTON');

    const projectButton = screen.getByText('My Project');
    expect(projectButton.tagName).toBe('BUTTON');

    const taskName = screen.getByText('Fix Bug');
    expect(taskName.tagName).toBe('SPAN');
    expect(taskName).toHaveAttribute('aria-current', 'page');

    fireEvent.click(myTasksButton);
    expect(mockNavigate).toHaveBeenCalledWith({ view: 'my-tasks' });
  });

  it('renders "My Tasks > Task" when from my-tasks with no project', async () => {
    mockCurrent = {
      view: 'task',
      id: 't1',
      taskName: 'Inbox Task',
      fromView: 'my-tasks',
    };
    mockCanGoToParent = true;
    await importAndRender();

    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByText('Inbox Task')).toBeInTheDocument();
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
  });
});
