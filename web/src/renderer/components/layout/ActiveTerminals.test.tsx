// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ActiveTerminals } from './ActiveTerminals.js';
import { SessionStatus } from '../../../shared/session-status.js';
import type { ActiveTerminalEntry } from '../../hooks/useActiveTerminals.js';
import { PullRequestStatus, CheckStatus } from '../../graphql/__generated__/generated.js';

const mockNavigate = vi.fn();
vi.mock('../../navigation/context.js', () => ({
  useNavigation: () => ({ navigate: mockNavigate, current: { view: 'projects' } }),
}));

afterEach(() => {
  cleanup();
  mockNavigate.mockClear();
});

function makeEntry(overrides: Partial<ActiveTerminalEntry> = {}): ActiveTerminalEntry {
  return {
    taskId: 'task-1',
    displayId: 'TSK-1',
    taskTitle: 'Test task',
    projectName: 'My Project',
    sessionCount: 1,
    status: SessionStatus.Running,
    ...overrides,
  };
}

describe('ActiveTerminals', () => {
  it('returns null when no entries', () => {
    const { container } = render(<ActiveTerminals entries={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders entries with status dots', () => {
    const entries = [makeEntry()];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByTestId('active-terminals')).toBeInTheDocument();
    expect(screen.getByText('TSK-1')).toBeInTheDocument();
    expect(screen.getByText('Test task')).toBeInTheDocument();
  });

  it('shows "Needs Permission" label for AWAITING_PERMISSION status', () => {
    const entries = [makeEntry({ status: SessionStatus.AwaitingPermission })];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByText('Needs Permission')).toBeInTheDocument();
  });

  it('shows project name for idle (WAITING_FOR_INPUT) status — no attention label', () => {
    const entries = [makeEntry({ status: SessionStatus.WaitingForInput })];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
  });

  it('shows project name for RUNNING status (no attention label)', () => {
    const entries = [makeEntry({ status: SessionStatus.Running })];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.queryByText('Needs Permission')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
  });

  it('shows attention count badge only for permission-blocked sessions', () => {
    const entries = [
      makeEntry({
        taskId: 'task-1',
        status: SessionStatus.AwaitingPermission,
      }),
      makeEntry({
        taskId: 'task-2',
        displayId: 'TSK-2',
        taskTitle: 'Another task',
        status: SessionStatus.WaitingForInput,
      }),
    ];
    render(<ActiveTerminals entries={entries} />);

    // Only the permission session counts — idle does not
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does not show attention badge when all running', () => {
    const entries = [
      makeEntry({ taskId: 'task-1', status: SessionStatus.Running }),
      makeEntry({
        taskId: 'task-2',
        displayId: 'TSK-2',
        taskTitle: 'Another task',
        status: SessionStatus.Running,
      }),
    ];
    render(<ActiveTerminals entries={entries} />);

    // The header should say "Active Terminals" but without a count badge
    expect(screen.getByText('Active Terminals')).toBeInTheDocument();
    // No numeric badge should be present
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('shows PR number and icon when pullRequest is present', () => {
    const entries = [
      makeEntry({
        pullRequest: {
          number: 42,
          status: PullRequestStatus.Open,
          draft: false,
          checkStatus: null,
        },
      }),
    ];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByText('#42')).toBeInTheDocument();
  });

  it('shows CI status dot when checkStatus is present', () => {
    const entries = [
      makeEntry({
        pullRequest: {
          number: 42,
          status: PullRequestStatus.Open,
          draft: false,
          checkStatus: CheckStatus.Success,
        },
      }),
    ];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByTestId('ci-status-dot')).toBeInTheDocument();
  });

  it('does not show PR indicator when pullRequest is absent', () => {
    const entries = [makeEntry()];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.queryByText(/#\d+/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('ci-status-dot')).not.toBeInTheDocument();
  });

  it('does not show PR info when attention label is shown', () => {
    const entries = [
      makeEntry({
        status: SessionStatus.AwaitingPermission,
        pullRequest: {
          number: 42,
          status: PullRequestStatus.Open,
          draft: false,
          checkStatus: null,
        },
      }),
    ];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByText('Needs Permission')).toBeInTheDocument();
    expect(screen.queryByText('#42')).not.toBeInTheDocument();
  });
});
