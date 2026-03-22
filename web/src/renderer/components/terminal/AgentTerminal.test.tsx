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
const mockAttachCustomKeyEventHandler = vi.fn();

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    write: mockWrite,
    open: mockOpen,
    dispose: mockDispose,
    loadAddon: mockLoadAddon,
    onData: mockOnData,
    attachCustomKeyEventHandler: mockAttachCustomKeyEventHandler,
    options: {},
    cols: 80,
    rows: 24,
  })),
}));

const mockFit = vi.fn();
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: mockFit,
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(),
}));

const mockWebglDispose = vi.fn();
const mockWebglOnContextLoss = vi.fn();
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(() => ({
    dispose: mockWebglDispose,
    onContextLoss: mockWebglOnContextLoss,
  })),
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

// Capture the ResizeObserver callback so we can invoke it in tests
let resizeObserverCallback: ResizeObserverCallback | null = null;

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
  // Mock ResizeObserver — capture the callback to simulate layout completion
  resizeObserverCallback = null;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = vi
    .fn()
    .mockImplementation((cb: ResizeObserverCallback) => {
      resizeObserverCallback = cb;
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
      };
    });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Simulate the first ResizeObserver callback (initial layout completion). */
function triggerInitialResize() {
  resizeObserverCallback?.([], {} as ResizeObserver);
}

// Dynamic import after mocks
const { AgentTerminal } = await import('./AgentTerminal.js');

describe('AgentTerminal', () => {
  it('renders the terminal container', () => {
    const { getByTestId } = render(<AgentTerminal sessionId="test-session" />);
    expect(getByTestId('agent-terminal')).toBeInTheDocument();
  });

  it('calls replay after ResizeObserver fires (not rAF)', async () => {
    render(<AgentTerminal sessionId="test-session" />);
    // Before ResizeObserver fires, replay should not have been called
    expect(mockReplay).not.toHaveBeenCalled();

    // Simulate layout completion
    triggerInitialResize();
    expect(mockReplay).toHaveBeenCalledWith('test-session');
  });

  it('resizes PTY after fit on initial ResizeObserver callback', () => {
    render(<AgentTerminal sessionId="test-session" />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockPtyResize).toHaveBeenCalledWith('test-session', 80, 24);
  });

  it('subscribes to onData for live output immediately (before resize)', () => {
    render(<AgentTerminal sessionId="test-session" />);
    // onData should be subscribed before ResizeObserver fires
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

  it('intercepts Shift+Enter to send CSI u escape sequence', () => {
    render(<AgentTerminal sessionId="test-session" />);
    expect(mockAttachCustomKeyEventHandler).toHaveBeenCalled();

    const handler = mockAttachCustomKeyEventHandler.mock.calls[0][0];

    // Shift+Enter keydown should send CSI u and return false
    const shiftEnter = { type: 'keydown', key: 'Enter', shiftKey: true };
    expect(handler(shiftEnter)).toBe(false);
    expect(mockPtyWrite).toHaveBeenCalledWith('test-session', '\x1b[13;2u');

    mockPtyWrite.mockClear();

    // Plain Enter should return true (default handling)
    const plainEnter = { type: 'keydown', key: 'Enter', shiftKey: false };
    expect(handler(plainEnter)).toBe(true);
    expect(mockPtyWrite).not.toHaveBeenCalled();

    // Other keys should return true
    const otherKey = { type: 'keydown', key: 'a', shiftKey: false };
    expect(handler(otherKey)).toBe(true);
  });

  it('loads WebGL addon and registers context loss handler', () => {
    render(<AgentTerminal sessionId="test-session" />);
    expect(mockLoadAddon).toHaveBeenCalledWith(
      expect.objectContaining({ dispose: mockWebglDispose }),
    );
    expect(mockWebglOnContextLoss).toHaveBeenCalledWith(expect.any(Function));
  });

  it('disposes WebGL addon on context loss', () => {
    render(<AgentTerminal sessionId="test-session" />);
    const onContextLossCallback = mockWebglOnContextLoss.mock.calls[0][0];
    onContextLossCallback();
    expect(mockWebglDispose).toHaveBeenCalled();
  });

  it('disposes terminal and WebGL addon on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="test-session" />);
    unmount();
    expect(mockWebglDispose).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });

  it('disconnects ResizeObserver on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="test-session" />);
    const observer = (globalThis as unknown as { ResizeObserver: ReturnType<typeof vi.fn> })
      .ResizeObserver;
    const instance = observer.mock.results[0].value;
    unmount();
    expect(instance.disconnect).toHaveBeenCalled();
  });
});
