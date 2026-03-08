// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TerminalTabs } from './TerminalTabs.js';
import type { TerminalSessionInfo } from '../../hooks/useTerminalSessions.js';
import { SessionStatus } from '../../../shared/session-status.js';

afterEach(cleanup);

const makeSessions = (overrides?: Partial<TerminalSessionInfo>[]): TerminalSessionInfo[] => [
  {
    id: 'sess-1',
    task_id: 'task-a',
    pid: 100,
    status: SessionStatus.Running,
    working_directory: '/tmp',
    started_at: '2024-01-01T00:00:00Z',
    stopped_at: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides?.[0],
  },
  {
    id: 'sess-2',
    task_id: 'task-b',
    pid: 200,
    status: SessionStatus.Exited,
    working_directory: '/tmp',
    started_at: '2024-01-01T00:00:00Z',
    stopped_at: '2024-01-01T01:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides?.[1],
  },
];

describe('TerminalTabs', () => {
  it('renders a tab for each session', () => {
    const sessions = makeSessions();
    render(
      <TerminalTabs
        sessions={sessions}
        activeSessionId="sess-1"
        onSelectSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    );

    expect(screen.getByTestId('terminal-tab-sess-1')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-tab-sess-2')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    const sessions = makeSessions();
    render(
      <TerminalTabs
        sessions={sessions}
        activeSessionId="sess-1"
        onSelectSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    );

    const activeTab = screen.getByTestId('terminal-tab-sess-1');
    const inactiveTab = screen.getByTestId('terminal-tab-sess-2');
    expect(activeTab.className).toContain('bg-gray-800');
    expect(inactiveTab.className).toContain('bg-gray-900');
  });

  it('calls onSelectSession when tab is clicked', () => {
    const sessions = makeSessions();
    const onSelect = vi.fn();
    render(
      <TerminalTabs
        sessions={sessions}
        activeSessionId="sess-1"
        onSelectSession={onSelect}
        onCloseSession={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('terminal-tab-sess-2'));
    expect(onSelect).toHaveBeenCalledWith('sess-2');
  });

  it('calls onCloseSession when close button is clicked', () => {
    const sessions = makeSessions();
    const onClose = vi.fn();
    render(
      <TerminalTabs
        sessions={sessions}
        activeSessionId="sess-1"
        onSelectSession={vi.fn()}
        onCloseSession={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('close-tab-sess-1'));
    expect(onClose).toHaveBeenCalledWith('sess-1');
  });

  it('shows correct status dot colors', () => {
    const sessions = makeSessions([
      { status: SessionStatus.Running },
      { status: SessionStatus.Error },
    ]);
    render(
      <TerminalTabs
        sessions={sessions}
        activeSessionId="sess-1"
        onSelectSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    );

    const runningDot = screen.getByTestId('status-dot-sess-1');
    const errorDot = screen.getByTestId('status-dot-sess-2');
    expect(runningDot.className).toContain('bg-success');
    expect(errorDot.className).toContain('bg-error');
  });

  it('shows pulse animation for STARTING status', () => {
    const sessions = makeSessions([{ status: SessionStatus.Starting }]);
    render(
      <TerminalTabs
        sessions={sessions}
        activeSessionId="sess-1"
        onSelectSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    );

    const dot = screen.getByTestId('status-dot-sess-1');
    expect(dot.className).toContain('animate-pulse');
    expect(dot.className).toContain('bg-info');
  });

  it('shows pulse animation for WAITING_FOR_INPUT status', () => {
    const sessions = makeSessions([{ status: SessionStatus.WaitingForInput }]);
    render(
      <TerminalTabs
        sessions={sessions}
        activeSessionId="sess-1"
        onSelectSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    );

    const dot = screen.getByTestId('status-dot-sess-1');
    expect(dot.className).toContain('animate-pulse');
    expect(dot.className).toContain('bg-warning');
  });
});
