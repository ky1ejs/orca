// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
const mockWrite = vi.fn((_data: string, cb?: () => void) => cb?.());
const mockOpen = vi.fn();
const mockDispose = vi.fn();
const mockLoadAddon = vi.fn();
const mockOnData = vi.fn().mockReturnValue({ dispose: vi.fn() });
const mockAttachCustomKeyEventHandler = vi.fn();
const mockScrollToBottom = vi.fn();
const mockRefresh = vi.fn();
const mockFocus = vi.fn();
const mockTerminalReset = vi.fn();
const mockBuffer = { active: { viewportY: 0, baseY: 0, length: 100 } };
const mockPaste = vi.fn();

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    write: mockWrite,
    open: mockOpen,
    dispose: mockDispose,
    loadAddon: mockLoadAddon,
    onData: mockOnData,
    attachCustomKeyEventHandler: mockAttachCustomKeyEventHandler,
    scrollToBottom: mockScrollToBottom,
    refresh: mockRefresh,
    reset: mockTerminalReset,
    focus: mockFocus,
    buffer: mockBuffer,
    paste: mockPaste,
    options: {},
    cols: 80,
    rows: 24,
  })),
}));

const mockFit = vi.fn();
const mockProposeDimensions = vi.fn().mockReturnValue({ cols: 120, rows: 30 });
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: mockFit,
    proposeDimensions: mockProposeDimensions,
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(),
}));

const mockSerialize = vi.fn().mockReturnValue('serialized state');
const mockSerializeDispose = vi.fn();
vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: vi.fn().mockImplementation(() => ({
    serialize: mockSerialize,
    dispose: mockSerializeDispose,
  })),
}));

const mockWebglDispose = vi.fn();
const mockWebglOnContextLoss = vi.fn();
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(() => ({
    dispose: mockWebglDispose,
    onContextLoss: mockWebglOnContextLoss,
  })),
}));

const mockSearchFindNext = vi.fn();
const mockSearchFindPrevious = vi.fn();
const mockSearchClearDecorations = vi.fn();
const mockSearchDispose = vi.fn();
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn().mockImplementation(() => ({
    findNext: mockSearchFindNext,
    findPrevious: mockSearchFindPrevious,
    clearDecorations: mockSearchClearDecorations,
    dispose: mockSearchDispose,
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
const mockPtySnapshot = vi.fn().mockResolvedValue(undefined);
const mockPtyAck = vi.fn();
const mockOnDaemonReconnected = vi.fn().mockReturnValue(vi.fn());

// Capture the ResizeObserver callback so we can invoke it in tests
let resizeObserverCallback: ResizeObserverCallback | null = null;

beforeEach(() => {
  // Reset mutable mock state between tests
  mockBuffer.active.viewportY = 0;
  mockBuffer.active.baseY = 0;
  mockProposeDimensions.mockReturnValue({ cols: 120, rows: 30 });
  // Add orca to existing window (don't overwrite — preserves matchMedia mock)
  (window as unknown as { orca: unknown }).orca = {
    pty: {
      replay: mockReplay,
      snapshot: mockPtySnapshot,
      ack: mockPtyAck,
      onData: mockPtyOnData,
      onExit: mockPtyOnExit,
      write: mockPtyWrite,
      resize: mockPtyResize,
    },
    lifecycle: {
      onDaemonReconnected: mockOnDaemonReconnected,
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
  const entry = { contentRect: { width: 800, height: 400 } } as ResizeObserverEntry;
  resizeObserverCallback?.([entry], {} as ResizeObserver);
}

// Dynamic import after mocks
const { AgentTerminal, escapeFilePath } = await import('./AgentTerminal.js');

describe('AgentTerminal', () => {
  it('renders the terminal container', () => {
    const { getByTestId } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    expect(getByTestId('agent-terminal')).toBeInTheDocument();
  });

  it('calls replay after ResizeObserver fires (not rAF)', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    // Before ResizeObserver fires, replay should not have been called
    expect(mockReplay).not.toHaveBeenCalled();

    // Simulate layout completion — replay is called with valid dimensions
    triggerInitialResize();
    expect(mockReplay).toHaveBeenCalledWith('test-session');

    // After replay resolves, onData should be subscribed
    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });
  });

  it('resizes PTY after fit on initial ResizeObserver callback', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockPtyResize).toHaveBeenCalledWith('test-session', 80, 24);
  });

  it('defers onData subscription until after fit + replay', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    // onData should NOT be subscribed before ResizeObserver fires
    expect(mockPtyOnData).not.toHaveBeenCalled();

    // Simulate layout completion — triggers fit + replay
    triggerInitialResize();

    // onData is subscribed after replay resolves
    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });
  });

  it('subscribes to onExit', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    expect(mockPtyOnExit).toHaveBeenCalledWith('test-session', expect.any(Function));
  });

  it('connects terminal onData to pty.write for user input', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    expect(mockOnData).toHaveBeenCalled();

    // Simulate user typing
    const onDataCallback = mockOnData.mock.calls[0][0];
    onDataCallback('hello');
    expect(mockPtyWrite).toHaveBeenCalledWith('test-session', 'hello');
  });

  it('intercepts Shift+Enter to send CSI u escape sequence', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
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

  it('does not load WebGL addon on mount when hidden', () => {
    render(<AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />);
    expect(mockWebglOnContextLoss).not.toHaveBeenCalled();
  });

  it('loads WebGL addon when terminal becomes visible', () => {
    const { rerender } = render(
      <AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />,
    );
    expect(mockWebglOnContextLoss).not.toHaveBeenCalled();

    rerender(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    expect(mockWebglOnContextLoss).toHaveBeenCalledWith(expect.any(Function));
  });

  it('disposes WebGL addon on context loss', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    const onContextLossCallback = mockWebglOnContextLoss.mock.calls[0][0];
    onContextLossCallback();
    expect(mockWebglDispose).toHaveBeenCalled();
  });

  it('recreates WebGL after context loss on next visibility change', () => {
    const { rerender } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    // Trigger context loss — addon disposed, ref cleared
    const onContextLossCallback = mockWebglOnContextLoss.mock.calls[0][0];
    onContextLossCallback();
    mockWebglOnContextLoss.mockClear();

    // Hide then show — should recreate WebGL since context was lost
    rerender(<AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />);
    rerender(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    expect(mockWebglOnContextLoss).toHaveBeenCalledWith(expect.any(Function));
  });

  it('keeps WebGL alive briefly when terminal becomes hidden', () => {
    const { rerender } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    mockWebglDispose.mockClear();

    rerender(<AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />);
    // WebGL stays alive immediately (delayed disposal)
    expect(mockWebglDispose).not.toHaveBeenCalled();
  });

  it('disposes WebGL after delay when terminal stays hidden', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      mockWebglDispose.mockClear();

      rerender(<AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />);
      vi.advanceTimersByTime(5_000);
      expect(mockWebglDispose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses existing WebGL addon on quick tab switch', async () => {
    const { WebglAddon } = await import('@xterm/addon-webgl');
    const { rerender } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    const initialCallCount = (WebglAddon as ReturnType<typeof vi.fn>).mock.calls.length;

    // Hide briefly then show — WebGL stays alive, no new creation
    rerender(<AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />);
    rerender(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);

    expect((WebglAddon as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCallCount);
  });

  it('disposes terminal and WebGL addon on unmount', () => {
    const { unmount } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    unmount();
    expect(mockWebglDispose).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });

  it('subscribes to onData even when replay fails', async () => {
    mockReplay.mockRejectedValueOnce(new Error('Daemon disconnected'));
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();

    // Despite replay rejection, onData should still be subscribed
    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });
  });

  it('re-replays and re-subscribes on daemon reconnection', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });

    // Capture the reconnection callback
    expect(mockOnDaemonReconnected).toHaveBeenCalled();
    const reconnectCallback = mockOnDaemonReconnected.mock.calls[0][0];

    // Reset mocks to track reconnection behavior
    mockReplay.mockClear();
    mockPtyOnData.mockClear();
    mockTerminalReset.mockClear();
    mockReplay.mockResolvedValueOnce('reconnected output');

    // Simulate daemon reconnection
    reconnectCallback();

    expect(mockTerminalReset).toHaveBeenCalled();
    expect(mockReplay).toHaveBeenCalledWith('test-session');

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });
  });

  it('still re-subscribes when reconnection replay fails', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });

    const reconnectCallback = mockOnDaemonReconnected.mock.calls[0][0];
    mockReplay.mockRejectedValueOnce(new Error('timeout'));
    mockPtyOnData.mockClear();

    reconnectCallback();

    // Even if replay fails, onData subscription should be re-established
    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });
  });

  it('cleans up daemon reconnection listener on unmount', () => {
    const mockUnsubReconnect = vi.fn();
    mockOnDaemonReconnected.mockReturnValueOnce(mockUnsubReconnect);

    const { unmount } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    unmount();

    expect(mockUnsubReconnect).toHaveBeenCalled();
  });

  it('disconnects ResizeObserver on unmount', () => {
    const { unmount } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    const observer = (globalThis as unknown as { ResizeObserver: ReturnType<typeof vi.fn> })
      .ResizeObserver;
    const instance = observer.mock.results[0].value;
    unmount();
    expect(instance.disconnect).toHaveBeenCalled();
  });

  it('loads SearchAddon', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    expect(mockLoadAddon).toHaveBeenCalledWith(
      expect.objectContaining({ findNext: mockSearchFindNext }),
    );
  });

  it('disposes SearchAddon on unmount', () => {
    const { unmount } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    unmount();
    expect(mockSearchDispose).toHaveBeenCalled();
  });

  it('intercepts Cmd+F to open search', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    const handler = mockAttachCustomKeyEventHandler.mock.calls[0][0];
    const cmdF = {
      type: 'keydown',
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    };
    expect(handler(cmdF)).toBe(false);
    expect(cmdF.preventDefault).toHaveBeenCalled();
  });

  it('intercepts Ctrl+F to open search', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    const handler = mockAttachCustomKeyEventHandler.mock.calls[0][0];
    const ctrlF = {
      type: 'keydown',
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      preventDefault: vi.fn(),
    };
    expect(handler(ctrlF)).toBe(false);
    expect(ctrlF.preventDefault).toHaveBeenCalled();
  });

  it('skips fit when proposed dimensions match current terminal dimensions', () => {
    mockProposeDimensions.mockReturnValue({ cols: 80, rows: 24 });
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();
    expect(mockFit).not.toHaveBeenCalled();
    expect(mockPtyResize).not.toHaveBeenCalled();
  });

  it('scrolls to bottom after fit when viewport was at bottom', () => {
    mockBuffer.active.viewportY = 100;
    mockBuffer.active.baseY = 100;
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockScrollToBottom).toHaveBeenCalled();
  });

  it('does not scroll to bottom after fit when viewport was scrolled up', () => {
    mockBuffer.active.viewportY = 50;
    mockBuffer.active.baseY = 100;
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('calls refresh after fitAndResize even when dimensions match', () => {
    mockProposeDimensions.mockReturnValue({ cols: 80, rows: 24 });
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();
    expect(mockFit).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledWith(0, 23);
  });

  it('scrolls to bottom when viewport is within 1 row of bottom', () => {
    mockBuffer.active.viewportY = 99;
    mockBuffer.active.baseY = 100;
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockScrollToBottom).toHaveBeenCalled();
  });

  it('throttles refresh calls during active output', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });

    const onDataCallback = mockPtyOnData.mock.calls[0][1];
    mockRefresh.mockClear();

    // Data is coalesced via rAF — push data, then flush the rAF
    onDataCallback('line 1');
    await vi.waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    // Immediate second data event within 1000ms should be throttled
    onDataCallback('line 2');
    await vi.waitFor(() => {
      // write fires (rAF flushes) but refresh is throttled
      expect(mockWrite).toHaveBeenCalled();
    });
    // refresh count stays at 1 (throttled)
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple onData events into a single write per frame', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });

    const onDataCallback = mockPtyOnData.mock.calls[0][1];
    mockWrite.mockClear();

    // Push multiple data events before rAF fires
    onDataCallback('aaa');
    onDataCallback('bbb');
    onDataCallback('ccc');

    // rAF flushes — should produce a single coalesced write
    await vi.waitFor(() => {
      expect(mockWrite).toHaveBeenCalledWith('aaabbbccc', expect.any(Function));
    });
    // Only one write call, not three
    const dataWrites = mockWrite.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && !call[0].includes('[Process exited'),
    );
    expect(dataWrites).toHaveLength(1);
  });

  it('sends ACK after xterm.js processes a write', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });

    const onDataCallback = mockPtyOnData.mock.calls[0][1];
    mockPtyAck.mockClear();

    onDataCallback('hello');

    await vi.waitFor(() => {
      expect(mockPtyAck).toHaveBeenCalledWith('test-session', 5);
    });
  });

  it('sends ACK after replay write completes', async () => {
    mockReplay.mockResolvedValue('replayed output');
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyAck).toHaveBeenCalledWith('test-session', 'replayed output'.length);
    });
  });

  it('ACKs pending data directly on unmount', async () => {
    const { unmount } = render(
      <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
    );
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });

    const onDataCallback = mockPtyOnData.mock.calls[0][1];
    mockPtyAck.mockClear();

    // Push data but don't wait for rAF
    onDataCallback('pending');

    // Unmount should ACK the pending data directly (not via terminal.write callback)
    unmount();

    expect(mockPtyAck).toHaveBeenCalledWith('test-session', 'pending'.length);
  });

  it('uses rAF for resize debounce instead of setTimeout', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    triggerInitialResize();
    mockFit.mockClear();
    mockPtyResize.mockClear();

    // Simulate a subsequent resize
    const entry = { contentRect: { width: 900, height: 500 } } as ResizeObserverEntry;
    resizeObserverCallback?.([entry], {} as ResizeObserver);

    // fit should be called via rAF (not setTimeout)
    await vi.waitFor(() => {
      expect(mockFit).toHaveBeenCalled();
    });
    expect(mockPtyResize).toHaveBeenCalled();
  });

  it('calls refresh, loads WebGL, and focuses when terminal becomes visible', () => {
    const { rerender } = render(
      <AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />,
    );
    triggerInitialResize();
    mockRefresh.mockClear();
    mockWebglOnContextLoss.mockClear();
    mockFocus.mockClear();

    rerender(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
    expect(mockRefresh).toHaveBeenCalledWith(0, 23);
    expect(mockWebglOnContextLoss).toHaveBeenCalledWith(expect.any(Function));
    expect(mockFocus).toHaveBeenCalled();
  });

  describe('drag and drop', () => {
    it('shows drop overlay on dragOver with files', () => {
      const { getByTestId, getByText } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.dragOver(container, {
        dataTransfer: { types: ['Files'] },
      });

      expect(getByText('Drop files to paste path')).toBeInTheDocument();
    });

    it('does not show drop overlay for non-file drags', () => {
      const { getByTestId, queryByText } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.dragOver(container, {
        dataTransfer: { types: ['text/plain'] },
      });

      expect(queryByText('Drop files to paste path')).not.toBeInTheDocument();
    });

    it('hides overlay on dragLeave', () => {
      const { getByTestId, queryByText } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.dragOver(container, {
        dataTransfer: { types: ['Files'] },
      });
      fireEvent.dragLeave(container, {
        relatedTarget: document.body,
      });

      expect(queryByText('Drop files to paste path')).not.toBeInTheDocument();
    });

    it('pastes single file path on drop', () => {
      const { getByTestId } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.drop(container, {
        dataTransfer: {
          files: [{ path: '/Users/test/screenshot.png' }],
          types: ['Files'],
        },
      });

      expect(mockPaste).toHaveBeenCalledWith('/Users/test/screenshot.png');
    });

    it('quotes paths with spaces', () => {
      const { getByTestId } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.drop(container, {
        dataTransfer: {
          files: [{ path: '/Users/test/my screenshot.png' }],
          types: ['Files'],
        },
      });

      expect(mockPaste).toHaveBeenCalledWith("'/Users/test/my screenshot.png'");
    });

    it('pastes multiple file paths space-separated', () => {
      const { getByTestId } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.drop(container, {
        dataTransfer: {
          files: [{ path: '/Users/test/file1.txt' }, { path: '/Users/test/file2.txt' }],
          types: ['Files'],
        },
      });

      expect(mockPaste).toHaveBeenCalledWith('/Users/test/file1.txt /Users/test/file2.txt');
    });

    it('hides overlay after drop', () => {
      const { getByTestId, queryByText } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.dragOver(container, {
        dataTransfer: { types: ['Files'] },
      });
      fireEvent.drop(container, {
        dataTransfer: {
          files: [{ path: '/Users/test/file.txt' }],
          types: ['Files'],
        },
      });

      expect(queryByText('Drop files to paste path')).not.toBeInTheDocument();
    });

    it('does not paste when no files are dropped', () => {
      const { getByTestId } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.drop(container, {
        dataTransfer: {
          files: [],
          types: ['Files'],
        },
      });

      expect(mockPaste).not.toHaveBeenCalled();
    });
  });

  it('includes scrollback in periodic snapshots', () => {
    vi.useFakeTimers();
    try {
      // Mock buffer with 100 lines total, 24 visible rows → 76 scrollback
      mockBuffer.active.length = 100;
      render(<AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />);
      triggerInitialResize();

      vi.advanceTimersByTime(5_000);

      expect(mockSerialize).toHaveBeenCalledWith({ scrollback: 76 });
    } finally {
      vi.useRealTimers();
    }
  });

  describe('lazy initialization', () => {
    it('does not initialize xterm for hidden exited sessions', () => {
      render(<AgentTerminal sessionId="test-session" visible={false} status="EXITED" />);
      expect(mockOpen).not.toHaveBeenCalled();
      expect(mockReplay).not.toHaveBeenCalled();
      expect(mockPtyOnExit).not.toHaveBeenCalled();
    });

    it('initializes xterm when a dormant session becomes visible', () => {
      const { rerender } = render(
        <AgentTerminal sessionId="test-session" visible={false} status="EXITED" />,
      );
      expect(mockOpen).not.toHaveBeenCalled();

      rerender(<AgentTerminal sessionId="test-session" visible={true} status="EXITED" />);
      expect(mockOpen).toHaveBeenCalled();
    });

    it('initializes xterm for hidden sessions with active status', () => {
      render(<AgentTerminal sessionId="test-session" visible={false} status="RUNNING" />);
      expect(mockOpen).toHaveBeenCalled();
    });

    it('does not tear down xterm when status goes inactive', () => {
      const { rerender } = render(
        <AgentTerminal sessionId="test-session" visible={true} status="RUNNING" />,
      );
      expect(mockOpen).toHaveBeenCalled();
      mockDispose.mockClear();

      rerender(<AgentTerminal sessionId="test-session" visible={false} status="EXITED" />);
      expect(mockDispose).not.toHaveBeenCalled();
    });

    it('initializes xterm for hidden sessions with STARTING status', () => {
      render(<AgentTerminal sessionId="test-session" visible={false} status="STARTING" />);
      expect(mockOpen).toHaveBeenCalled();
    });

    it('initializes xterm for hidden sessions with AWAITING_PERMISSION status', () => {
      render(
        <AgentTerminal sessionId="test-session" visible={false} status="AWAITING_PERMISSION" />,
      );
      expect(mockOpen).toHaveBeenCalled();
    });

    it('does not initialize xterm for hidden ERROR sessions', () => {
      render(<AgentTerminal sessionId="test-session" visible={false} status="ERROR" />);
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('renders the container div even when dormant', () => {
      const { getByTestId } = render(
        <AgentTerminal sessionId="test-session" visible={false} status="EXITED" />,
      );
      expect(getByTestId('agent-terminal')).toBeInTheDocument();
    });
  });
});

describe('escapeFilePath', () => {
  it('returns simple paths unquoted', () => {
    expect(escapeFilePath('/Users/test/file.txt')).toBe('/Users/test/file.txt');
  });

  it('quotes paths with spaces', () => {
    expect(escapeFilePath('/Users/test/my file.txt')).toBe("'/Users/test/my file.txt'");
  });

  it('escapes single quotes within the path', () => {
    expect(escapeFilePath("/Users/test/it's a file.txt")).toBe("'/Users/test/it'\\''s a file.txt'");
  });

  it('quotes paths with parentheses', () => {
    expect(escapeFilePath('/Users/test/file (1).txt')).toBe("'/Users/test/file (1).txt'");
  });

  it('strips dangerous shell characters', () => {
    expect(escapeFilePath('/Users/test/file$evil.txt')).toBe('/Users/test/fileevil.txt');
  });

  it('strips backticks', () => {
    expect(escapeFilePath('/Users/test/file`cmd`.txt')).toBe('/Users/test/filecmd.txt');
  });

  it('handles paths with both spaces and dangerous chars', () => {
    expect(escapeFilePath('/Users/test/my $file.txt')).toBe("'/Users/test/my file.txt'");
  });
});
