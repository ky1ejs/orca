// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TerminalSetupView } from './TerminalSetupView.js';
import type { BootstrapStatus } from '../../hooks/useBootstrapStatus.js';

afterEach(cleanup);

const idle: BootstrapStatus = { state: 'idle', lines: [], error: null };
const running = (lines: string[]): BootstrapStatus => ({ state: 'running', lines, error: null });
const failed = (lines: string[], error: string): BootstrapStatus => ({
  state: 'failed',
  lines,
  error,
});

describe('TerminalSetupView', () => {
  it('shows the launching headline when launching is true', () => {
    render(<TerminalSetupView status={idle} launching />);
    expect(screen.getByTestId('terminal-setup-view')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-setup-icon-running')).toBeInTheDocument();
    expect(screen.getByText(/Starting your terminal/)).toBeInTheDocument();
  });

  it('shows the setup headline when bootstrap is running', () => {
    render(<TerminalSetupView status={running(['npm install', 'compiling'])} launching={false} />);
    expect(screen.getByText(/Setting up your terminal/)).toBeInTheDocument();
    const tail = screen.getByTestId('terminal-setup-tail');
    expect(tail).toHaveTextContent('npm install');
    expect(tail).toHaveTextContent('compiling');
  });

  it('only shows the last 5 lines in the tail', () => {
    const lines = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    render(<TerminalSetupView status={running(lines)} launching={false} />);
    const tail = screen.getByTestId('terminal-setup-tail');
    expect(tail).toHaveTextContent('c');
    expect(tail).toHaveTextContent('g');
    expect(tail).not.toHaveTextContent('a');
    expect(tail).not.toHaveTextContent('b');
  });

  it('renders failure state with error message', () => {
    render(
      <TerminalSetupView status={failed(['oops'], 'install failed: ENOENT')} launching={false} />,
    );
    expect(screen.getByTestId('terminal-setup-icon-failed')).toBeInTheDocument();
    expect(screen.getByText(/Setup failed/)).toBeInTheDocument();
    expect(screen.getByTestId('terminal-setup-error')).toHaveTextContent('install failed: ENOENT');
  });

  it('omits the tail when there are no lines', () => {
    render(<TerminalSetupView status={idle} launching />);
    expect(screen.queryByTestId('terminal-setup-tail')).not.toBeInTheDocument();
  });
});
