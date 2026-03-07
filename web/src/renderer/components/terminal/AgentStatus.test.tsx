// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AgentStatus } from './AgentStatus.js';

afterEach(cleanup);

describe('AgentStatus', () => {
  it('renders "Starting" with blue styling', () => {
    render(<AgentStatus status="STARTING" />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Starting');
    expect(badge.className).toContain('bg-blue-900');
  });

  it('renders "Running" with green styling', () => {
    render(<AgentStatus status="RUNNING" />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Running');
    expect(badge.className).toContain('bg-green-900');
  });

  it('renders "Waiting for Input" with yellow styling and pulse', () => {
    render(<AgentStatus status="WAITING_FOR_INPUT" />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Waiting for Input');
    expect(badge.className).toContain('bg-yellow-900');
    // Pulse is on the dot span inside the badge
    const dot = badge.querySelector('span');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('renders "Exited" with gray styling', () => {
    render(<AgentStatus status="EXITED" />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Exited');
    expect(badge.className).toContain('bg-gray-700');
  });

  it('renders "Error" with red styling', () => {
    render(<AgentStatus status="ERROR" />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Error');
    expect(badge.className).toContain('bg-red-900');
  });

  it('falls back to EXITED styling for unknown status', () => {
    render(<AgentStatus status="UNKNOWN" />);
    const badge = screen.getByTestId('agent-status-badge');
    expect(badge).toHaveTextContent('Exited');
    expect(badge.className).toContain('bg-gray-700');
  });
});
