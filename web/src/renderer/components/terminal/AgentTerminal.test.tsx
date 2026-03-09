// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock matchMedia for color scheme listener
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock xterm.js
const mockWrite = vi.fn();
const mockOpen = vi.fn();
const mockDispose = vi.fn();
const mockLoadAddon = vi.fn();
const mockOnData = vi.fn().mockReturnValue({ dispose: vi.fn() });

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    write: mockWrite,
    open: mockOpen,
    dispose: mockDispose,
    loadAddon: mockLoadAddon,
    onData: mockOnData,
    options: {},
    cols: 80,
    rows: 24,
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(),
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('../../preferences/context.js', () => ({
  usePreferences: () => ({
    terminalFontFamily: 'monospace',
    setTerminalFontFamily: vi.fn(),
  }),
}));

const mockReplay = vi.fn().mockResolvedValue('previous output');
const mockPtyOnData = vi.fn().mockReturnValue(vi.fn());
const mockPtyOnExit = vi.fn().mockReturnValue(vi.fn());
const mockPtyWrite = vi.fn();
const mockPtyResize = vi.fn();

beforeEach(() => {
  // Add orca to existing window (don't overwrite — preserves matchMedia mock)
  (window as unknown as { orca: unknown }).orca = {
    pty: {
      replay: mockReplay,
      onData: mockPtyOnData,
      onExit: mockPtyOnExit,
      write: mockPtyWrite,
      resize: mockPtyResize,
    },
  };
  // Mock ResizeObserver
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = vi
    .fn()
    .mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Dynamic import after mocks
const { AgentTerminal } = await import('./AgentTerminal.js');

describe('AgentTerminal', () => {
  it('renders the terminal container', () => {
    const { getByTestId } = render(<AgentTerminal sessionId="test-session" />);
    expect(getByTestId('agent-terminal')).toBeInTheDocument();
  });

  it('calls replay on mount', async () => {
    render(<AgentTerminal sessionId="test-session" />);
    expect(mockReplay).toHaveBeenCalledWith('test-session');
  });

  it('subscribes to onData for live output', () => {
    render(<AgentTerminal sessionId="test-session" />);
    expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
  });

  it('subscribes to onExit', () => {
    render(<AgentTerminal sessionId="test-session" />);
    expect(mockPtyOnExit).toHaveBeenCalledWith('test-session', expect.any(Function));
  });

  it('connects terminal onData to pty.write for user input', () => {
    render(<AgentTerminal sessionId="test-session" />);
    expect(mockOnData).toHaveBeenCalled();

    // Simulate user typing
    const onDataCallback = mockOnData.mock.calls[0][0];
    onDataCallback('hello');
    expect(mockPtyWrite).toHaveBeenCalledWith('test-session', 'hello');
  });

  it('disposes terminal on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="test-session" />);
    unmount();
    expect(mockDispose).toHaveBeenCalled();
  });
});
