// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ActiveTerminals } from './ActiveTerminals.js';
import { SessionStatus } from '../../../shared/session-status.js';
import type { ActiveTerminalEntry } from '../../hooks/useActiveTerminals.js';

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

  it('shows "Waiting" label for WAITING_FOR_INPUT status', () => {
    const entries = [makeEntry({ status: SessionStatus.WaitingForInput })];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('shows project name for RUNNING status (no attention label)', () => {
    const entries = [makeEntry({ status: SessionStatus.Running })];
    render(<ActiveTerminals entries={entries} />);

    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.queryByText('Needs Permission')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
  });

  it('shows attention count badge in header', () => {
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

    expect(screen.getByText('2')).toBeInTheDocument();
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
});
