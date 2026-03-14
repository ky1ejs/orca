// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockGetStatus = vi.fn();
const mockForceRestartDaemon = vi.fn().mockResolvedValue(undefined);
const mockOnDaemonDisconnected = vi.fn().mockReturnValue(() => {});
const mockOnDaemonReconnected = vi.fn().mockReturnValue(() => {});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(window, 'orca', {
    value: {
      daemon: { getStatus: mockGetStatus },
      lifecycle: {
        onDaemonDisconnected: mockOnDaemonDisconnected,
        onDaemonReconnected: mockOnDaemonReconnected,
        forceRestartDaemon: mockForceRestartDaemon,
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const { DaemonSettings } = await import('./DaemonSettings.js');

const MOCK_STATUS = {
  version: '1.2.3',
  protocolVersion: 2,
  uptime: 180120, // 2d 2h 2m
  activeSessions: 3,
  connectedClients: 1,
};

describe('DaemonSettings', () => {
  it('renders status info when daemon is connected', async () => {
    mockGetStatus.mockResolvedValue(MOCK_STATUS);
    const { getByText } = render(<DaemonSettings />);

    await waitFor(() => {
      expect(getByText('Connected')).toBeInTheDocument();
      expect(getByText('1.2.3')).toBeInTheDocument();
      expect(getByText('2d 2h 2m')).toBeInTheDocument();
      expect(getByText('3')).toBeInTheDocument();
    });
  });

  it('shows disconnected state on error', async () => {
    mockGetStatus.mockRejectedValue(new Error('Connection refused'));
    const { getByText } = render(<DaemonSettings />);

    await waitFor(() => {
      expect(getByText('Disconnected')).toBeInTheDocument();
      expect(getByText('Connection refused')).toBeInTheDocument();
    });
  });

  it('shows restart confirmation with active session warning', async () => {
    mockGetStatus.mockResolvedValue(MOCK_STATUS);
    const { getByText } = render(<DaemonSettings />);

    await waitFor(() => expect(getByText('Restart Daemon')).toBeInTheDocument());

    fireEvent.click(getByText('Restart Daemon'));
    expect(getByText('3 active sessions will be interrupted.')).toBeInTheDocument();
    expect(getByText('Confirm Restart')).toBeInTheDocument();
    expect(getByText('Cancel')).toBeInTheDocument();
  });

  it('calls forceRestartDaemon on confirm', async () => {
    mockGetStatus.mockResolvedValue(MOCK_STATUS);
    const { getByText } = render(<DaemonSettings />);

    await waitFor(() => expect(getByText('Restart Daemon')).toBeInTheDocument());
    fireEvent.click(getByText('Restart Daemon'));
    fireEvent.click(getByText('Confirm Restart'));

    await waitFor(() => {
      expect(mockForceRestartDaemon).toHaveBeenCalled();
    });
  });

  it('cancels restart confirmation', async () => {
    mockGetStatus.mockResolvedValue(MOCK_STATUS);
    const { getByText, queryByText } = render(<DaemonSettings />);

    await waitFor(() => expect(getByText('Restart Daemon')).toBeInTheDocument());
    fireEvent.click(getByText('Restart Daemon'));
    fireEvent.click(getByText('Cancel'));

    expect(queryByText('Confirm Restart')).not.toBeInTheDocument();
    expect(getByText('Restart Daemon')).toBeInTheDocument();
  });
});
