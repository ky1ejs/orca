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
const mockWrite = vi.fn();
const mockOpen = vi.fn();
const mockDispose = vi.fn();
const mockLoadAddon = vi.fn();
const mockOnData = vi.fn().mockReturnValue({ dispose: vi.fn() });
const mockAttachCustomKeyEventHandler = vi.fn();
const mockScrollToBottom = vi.fn();
const mockRefresh = vi.fn();
const mockBuffer = { active: { viewportY: 0, baseY: 0 } };
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
  const entry = { contentRect: { width: 800, height: 400 } } as ResizeObserverEntry;
  resizeObserverCallback?.([entry], {} as ResizeObserver);
}

// Dynamic import after mocks
const { AgentTerminal, escapeFilePath } = await import('./AgentTerminal.js');

describe('AgentTerminal', () => {
  it('renders the terminal container', () => {
    const { getByTestId } = render(<AgentTerminal sessionId="test-session" visible={true} />);
    expect(getByTestId('agent-terminal')).toBeInTheDocument();
  });

  it('calls replay after ResizeObserver fires (not rAF)', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
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
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockPtyResize).toHaveBeenCalledWith('test-session', 80, 24);
  });

  it('defers onData subscription until after fit + replay', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
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
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    expect(mockPtyOnExit).toHaveBeenCalledWith('test-session', expect.any(Function));
  });

  it('connects terminal onData to pty.write for user input', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    expect(mockOnData).toHaveBeenCalled();

    // Simulate user typing
    const onDataCallback = mockOnData.mock.calls[0][0];
    onDataCallback('hello');
    expect(mockPtyWrite).toHaveBeenCalledWith('test-session', 'hello');
  });

  it('intercepts Shift+Enter to send CSI u escape sequence', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
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
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    expect(mockLoadAddon).toHaveBeenCalledWith(
      expect.objectContaining({ dispose: mockWebglDispose }),
    );
    expect(mockWebglOnContextLoss).toHaveBeenCalledWith(expect.any(Function));
  });

  it('disposes WebGL addon on context loss', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    const onContextLossCallback = mockWebglOnContextLoss.mock.calls[0][0];
    onContextLossCallback();
    expect(mockWebglDispose).toHaveBeenCalled();
  });

  it('disposes terminal and WebGL addon on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="test-session" visible={true} />);
    unmount();
    expect(mockWebglDispose).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });

  it('disconnects ResizeObserver on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="test-session" visible={true} />);
    const observer = (globalThis as unknown as { ResizeObserver: ReturnType<typeof vi.fn> })
      .ResizeObserver;
    const instance = observer.mock.results[0].value;
    unmount();
    expect(instance.disconnect).toHaveBeenCalled();
  });

  it('loads SearchAddon', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    expect(mockLoadAddon).toHaveBeenCalledWith(
      expect.objectContaining({ findNext: mockSearchFindNext }),
    );
  });

  it('disposes SearchAddon on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="test-session" visible={true} />);
    unmount();
    expect(mockSearchDispose).toHaveBeenCalled();
  });

  it('intercepts Cmd+F to open search', () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
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
    render(<AgentTerminal sessionId="test-session" visible={true} />);
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
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    triggerInitialResize();
    // proposeDimensions returns 80x24 which matches terminal.cols/rows — fit should be skipped
    expect(mockFit).not.toHaveBeenCalled();
    expect(mockPtyResize).not.toHaveBeenCalled();
  });

  it('scrolls to bottom after fit when viewport was at bottom', () => {
    mockBuffer.active.viewportY = 100;
    mockBuffer.active.baseY = 100;
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockScrollToBottom).toHaveBeenCalled();
  });

  it('does not scroll to bottom after fit when viewport was scrolled up', () => {
    mockBuffer.active.viewportY = 50;
    mockBuffer.active.baseY = 100;
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('calls refresh after fitAndResize even when dimensions match', () => {
    mockProposeDimensions.mockReturnValue({ cols: 80, rows: 24 });
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    triggerInitialResize();
    // fit should be skipped (dimensions match) but refresh should still fire
    expect(mockFit).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledWith(0, 23);
  });

  it('scrolls to bottom when viewport is within 1 row of bottom', () => {
    mockBuffer.active.viewportY = 99;
    mockBuffer.active.baseY = 100;
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    triggerInitialResize();
    expect(mockFit).toHaveBeenCalled();
    expect(mockScrollToBottom).toHaveBeenCalled();
  });

  it('throttles refresh calls during active output', async () => {
    render(<AgentTerminal sessionId="test-session" visible={true} />);
    triggerInitialResize();

    await vi.waitFor(() => {
      expect(mockPtyOnData).toHaveBeenCalledWith('test-session', expect.any(Function));
    });

    const onDataCallback = mockPtyOnData.mock.calls[0][1];
    mockRefresh.mockClear();

    // First data event should trigger refresh
    onDataCallback('line 1');
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    // Immediate second call should be throttled (within 1000ms)
    onDataCallback('line 2');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls refresh when terminal becomes visible', () => {
    const { rerender } = render(<AgentTerminal sessionId="test-session" visible={false} />);
    triggerInitialResize();
    mockRefresh.mockClear();

    rerender(<AgentTerminal sessionId="test-session" visible={true} />);
    expect(mockRefresh).toHaveBeenCalledWith(0, 23);
  });

  describe('drag and drop', () => {
    it('shows drop overlay on dragOver with files', () => {
      const { getByTestId, getByText } = render(
        <AgentTerminal sessionId="test-session" visible={true} />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.dragOver(container, {
        dataTransfer: { types: ['Files'] },
      });

      expect(getByText('Drop files to paste path')).toBeInTheDocument();
    });

    it('does not show drop overlay for non-file drags', () => {
      const { getByTestId, queryByText } = render(
        <AgentTerminal sessionId="test-session" visible={true} />,
      );
      const container = getByTestId('agent-terminal');

      fireEvent.dragOver(container, {
        dataTransfer: { types: ['text/plain'] },
      });

      expect(queryByText('Drop files to paste path')).not.toBeInTheDocument();
    });

    it('hides overlay on dragLeave', () => {
      const { getByTestId, queryByText } = render(
        <AgentTerminal sessionId="test-session" visible={true} />,
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
      const { getByTestId } = render(<AgentTerminal sessionId="test-session" visible={true} />);
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
      const { getByTestId } = render(<AgentTerminal sessionId="test-session" visible={true} />);
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
      const { getByTestId } = render(<AgentTerminal sessionId="test-session" visible={true} />);
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
        <AgentTerminal sessionId="test-session" visible={true} />,
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
      const { getByTestId } = render(<AgentTerminal sessionId="test-session" visible={true} />);
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
