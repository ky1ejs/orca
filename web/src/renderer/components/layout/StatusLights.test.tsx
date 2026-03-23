// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StatusLights, StatusLightsCollapsed } from './StatusLights.js';

afterEach(cleanup);

describe('StatusLights', () => {
  it('renders three green dots when all connected', () => {
    render(<StatusLights daemon={true} mcpServer={true} backend={true} />);

    const dots = screen.getAllByTestId(/^status-dot-/);
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      expect(dot).toHaveClass('bg-success');
    }
  });

  it('renders red dot for disconnected daemon', () => {
    render(<StatusLights daemon={false} mcpServer={true} backend={true} />);

    expect(screen.getByTestId('status-dot-daemon')).toHaveClass('bg-error');
    expect(screen.getByTestId('status-dot-mcp')).toHaveClass('bg-success');
    expect(screen.getByTestId('status-dot-api')).toHaveClass('bg-success');
  });

  it('renders red dot for disconnected MCP', () => {
    render(<StatusLights daemon={true} mcpServer={false} backend={true} />);

    expect(screen.getByTestId('status-dot-daemon')).toHaveClass('bg-success');
    expect(screen.getByTestId('status-dot-mcp')).toHaveClass('bg-error');
    expect(screen.getByTestId('status-dot-api')).toHaveClass('bg-success');
  });

  it('renders red dot for disconnected backend', () => {
    render(<StatusLights daemon={true} mcpServer={true} backend={false} />);

    expect(screen.getByTestId('status-dot-daemon')).toHaveClass('bg-success');
    expect(screen.getByTestId('status-dot-mcp')).toHaveClass('bg-success');
    expect(screen.getByTestId('status-dot-api')).toHaveClass('bg-error');
  });

  it('renders labels for each status', () => {
    render(<StatusLights daemon={true} mcpServer={true} backend={true} />);

    expect(screen.getByText('Daemon')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
  });
});

describe('StatusLightsCollapsed', () => {
  it('renders three dots without labels', () => {
    render(<StatusLightsCollapsed daemon={true} mcpServer={true} backend={true} />);

    const container = screen.getByTestId('status-lights-collapsed');
    expect(container).toBeInTheDocument();
    expect(container.querySelectorAll('.rounded-full')).toHaveLength(3);
    expect(screen.queryByText('Daemon')).not.toBeInTheDocument();
  });

  it('shows correct colors for mixed states', () => {
    render(<StatusLightsCollapsed daemon={true} mcpServer={false} backend={true} />);

    expect(screen.getByTestId('status-dot-daemon')).toHaveClass('bg-success');
    expect(screen.getByTestId('status-dot-mcp')).toHaveClass('bg-error');
    expect(screen.getByTestId('status-dot-api')).toHaveClass('bg-success');
  });
});
