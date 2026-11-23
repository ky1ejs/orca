// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockLaunch = vi.fn();
const mockRestart = vi.fn();
let errorSession: { id: string; status: string } | undefined;
let isExternal = false;

vi.mock('./TaskHeaderContext.js', () => ({
  useTaskHeaderControls: () => ({
    displayId: 'CUT-1',
    taskId: 'task-1',
    activeSession: undefined,
    errorSession,
    projectDirectory: '/repo',
    refreshSessions: vi.fn(),
    buildMetadata: () => ({
      displayId: 'CUT-1',
      title: 'Bug report',
      description: null,
      projectName: null,
      workspaceSlug: 'cut',
      isExternal,
    }),
    onAgentError: vi.fn(),
  }),
  useTaskLaunching: () => ({ launching: false, setLaunching: vi.fn() }),
}));
vi.mock('../../platform/usePlatform.js', () => ({
  usePlatform: () => ({
    kind: 'electron',
    orca: { agent: { launch: mockLaunch, restart: mockRestart } },
  }),
}));
vi.mock('../../hooks/useSessionActivity.js', () => ({ useSessionActivity: () => new Set() }));
vi.mock('../../preferences/context.js', () => ({
  usePreferences: () => ({ agentLaunchMode: 'terminal', setAgentLaunchMode: vi.fn() }),
}));
vi.mock('../../hooks/useBootstrapStatus.js', () => ({ useBootstrapStatus: () => null }));
vi.mock('../../../shared/perf.js', () => ({
  createPerfTimer: () => () => {},
  rendererPerfLog: {},
}));

beforeEach(() => {
  isExternal = false;
  errorSession = undefined;
  mockLaunch.mockResolvedValue({ success: true });
  mockRestart.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockLaunch.mockReset();
  mockRestart.mockReset();
});

async function importAndRender() {
  const { HeaderTerminalControls } = await import('./HeaderTerminalControls.js');
  return render(<HeaderTerminalControls />);
}

describe('HeaderTerminalControls launch', () => {
  it('launches straight away for a task created by a person', async () => {
    await importAndRender();
    fireEvent.click(screen.getByTestId('agent-button'));
    await waitFor(() => expect(mockLaunch).toHaveBeenCalled());
    expect(screen.queryByTestId('external-agent-start-dialog')).not.toBeInTheDocument();
  });

  it('asks before launching on an external task, and does nothing if cancelled', async () => {
    isExternal = true;
    await importAndRender();
    fireEvent.click(screen.getByTestId('agent-button'));

    expect(screen.getByTestId('external-agent-start-dialog')).toHaveTextContent('untrusted input');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('external-agent-start-dialog')).not.toBeInTheDocument();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('launches on an external task once the person confirms', async () => {
    isExternal = true;
    await importAndRender();
    fireEvent.click(screen.getByTestId('agent-button'));
    fireEvent.click(screen.getByTestId('external-agent-start-confirm'));
    await waitFor(() => expect(mockLaunch).toHaveBeenCalled());
    expect(mockLaunch.mock.calls[0][3]).toMatchObject({ isExternal: true });
  });

  it('asks before restarting an errored agent on an external task', async () => {
    isExternal = true;
    errorSession = { id: 's1', status: 'error' };
    await importAndRender();
    fireEvent.click(screen.getByTestId('agent-button'));
    expect(screen.getByTestId('external-agent-start-dialog')).toBeInTheDocument();
    expect(mockRestart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('external-agent-start-confirm'));
    await waitFor(() => expect(mockRestart).toHaveBeenCalled());
  });
});
