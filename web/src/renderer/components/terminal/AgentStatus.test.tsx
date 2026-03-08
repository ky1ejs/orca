// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AgentStatus } from './AgentStatus.js';
import { SessionStatus } from '../../../shared/session-status.js';

afterEach(cleanup);

describe('AgentStatus', () => {
  it('renders "Starting" with blue styling', () => {
    render(<AgentStatus status={SessionStatus.Starting} />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Starting');
    expect(badge.className).toContain('bg-info-muted');
  });

  it('renders "Running" with green styling', () => {
    render(<AgentStatus status={SessionStatus.Running} />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Running');
    expect(badge.className).toContain('bg-success-muted');
  });

  it('renders "Waiting for Input" with yellow styling and pulse', () => {
    render(<AgentStatus status={SessionStatus.WaitingForInput} />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Waiting for Input');
    expect(badge.className).toContain('bg-warning-muted');
    // Pulse is on the dot span inside the badge
    const dot = badge.querySelector('span');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('renders "Exited" with gray styling', () => {
    render(<AgentStatus status={SessionStatus.Exited} />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Exited');
    expect(badge.className).toContain('bg-gray-700');
  });

  it('renders "Error" with red styling', () => {
    render(<AgentStatus status={SessionStatus.Error} />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Error');
    expect(badge.className).toContain('bg-error-muted');
  });

  it('falls back to EXITED styling for unknown status', () => {
    render(<AgentStatus status="UNKNOWN" />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Exited');
    expect(badge.className).toContain('bg-gray-700');
  });
});
