// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockLaunch = vi.fn();
let isExternal = false;

vi.mock('./TaskHeaderContext.js', () => ({
  useTaskHeaderControls: () => ({
    displayId: 'CUT-1',
    taskId: 'task-1',
    activeSession: undefined,
    errorSession: undefined,
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
  usePlatform: () => ({ kind: 'electron', orca: { agent: { launch: mockLaunch } } }),
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
  mockLaunch.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockLaunch.mockReset();
});

async function importAndRender() {
  const { HeaderTerminalControls } = await import('./HeaderTerminalControls.js');
  return render(<HeaderTerminalControls />);
}

describe('HeaderTerminalControls launch', () => {
  it('launches straight away for a task created by a person', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await importAndRender();
    fireEvent.click(screen.getByTestId('agent-button'));
    await waitFor(() => expect(mockLaunch).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before launching on an external task, and does nothing if declined', async () => {
    isExternal = true;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await importAndRender();
    fireEvent.click(screen.getByTestId('agent-button'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('untrusted input'));
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('launches on an external task once the person confirms', async () => {
    isExternal = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await importAndRender();
    fireEvent.click(screen.getByTestId('agent-button'));
    await waitFor(() => expect(mockLaunch).toHaveBeenCalled());
    expect(mockLaunch.mock.calls[0][3]).toMatchObject({ isExternal: true });
  });
});
