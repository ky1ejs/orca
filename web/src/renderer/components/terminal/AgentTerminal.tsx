import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { SerializeAddon } from '@xterm/addon-serialize';
import { SearchAddon } from '@xterm/addon-search';
import { usePreferences } from '../../preferences/context.js';
import { TerminalSearchBar } from './TerminalSearchBar.js';
import '@xterm/xterm/css/xterm.css';

function readTerminalTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (prop: string) => s.getPropertyValue(prop).trim();
  return {
    background: v('--color-terminal-bg') || '#030712',
    foreground: v('--color-terminal-fg') || '#e5e7eb',
    cursor: v('--color-terminal-cursor') || '#e5e7eb',
    selectionBackground: v('--color-terminal-selection') || '#374151',
    // ANSI palette overrides — all 16 colors adapt to the current color scheme.
    // Fallbacks are dark-mode defaults (Tailwind 500/400 shades).
    black: v('--color-terminal-ansi-black') || '#000000',
    brightBlack: v('--color-terminal-ansi-bright-black') || '#6b7280',
    white: v('--color-terminal-ansi-white') || '#e5e7eb',
    brightWhite: v('--color-terminal-ansi-bright-white') || '#ffffff',
    red: v('--color-terminal-ansi-red') || '#ef4444',
    brightRed: v('--color-terminal-ansi-bright-red') || '#f87171',
    green: v('--color-terminal-ansi-green') || '#22c55e',
    brightGreen: v('--color-terminal-ansi-bright-green') || '#4ade80',
    yellow: v('--color-terminal-ansi-yellow') || '#eab308',
    brightYellow: v('--color-terminal-ansi-bright-yellow') || '#facc15',
    blue: v('--color-terminal-ansi-blue') || '#3b82f6',
    brightBlue: v('--color-terminal-ansi-bright-blue') || '#60a5fa',
    magenta: v('--color-terminal-ansi-magenta') || '#a855f7',
    brightMagenta: v('--color-terminal-ansi-bright-magenta') || '#c084fc',
    cyan: v('--color-terminal-ansi-cyan') || '#06b6d4',
    brightCyan: v('--color-terminal-ansi-bright-cyan') || '#22d3ee',
  };
}

interface AgentTerminalProps {
  sessionId: string;
}

/** Fit the terminal to its container and sync the PTY dimensions. */
function fitAndResize(fitAddon: FitAddon, terminal: Terminal, sessionId: string): void {
  try {
    const dims = fitAddon.proposeDimensions();
    if (!dims || isNaN(dims.cols) || isNaN(dims.rows)) return;
    if (dims.cols === terminal.cols && dims.rows === terminal.rows) return;

    // Preserve scroll position across resize — fit() calls _renderService.clear()
    // + terminal.resize() which can reset the viewport scroll offset.
    const buffer = terminal.buffer.active;
    const wasAtBottom = buffer.viewportY >= buffer.baseY;

    fitAddon.fit();
    window.orca.pty.resize(sessionId, terminal.cols, terminal.rows);

    if (wasAtBottom) {
      terminal.scrollToBottom();
    }
  } catch {
    // Container may have been removed before the fit completes
  }
}

export function AgentTerminal({ sessionId }: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const { terminalFontFamily } = usePreferences();
  const fontRef = useRef(terminalFontFamily);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      theme: readTerminalTheme(),
      fontFamily: fontRef.current,
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(container);

    // GPU-accelerated rendering with graceful fallback to DOM renderer
    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddon = null;
      });
      terminal.loadAddon(webglAddon);
    } catch {
      webglAddon = null;
    }

    // Intercept Shift+Enter to send CSI u encoding (\x1b[13;2u) instead of
    // plain \r so Claude Code can distinguish it and insert a newline.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.key === 'Enter' && event.shiftKey) {
        window.orca.pty.write(sessionId, '\x1b[13;2u');
        return false;
      }
      if (event.type === 'keydown' && event.key === 'f' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchVisible(true);
        return false;
      }
      return true;
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Subscribe to live output + keyboard input immediately (no dimension dependency)
    const unsubData = window.orca.pty.onData(sessionId, (data) => {
      terminal.write(data);
    });

    const onDataDisposable = terminal.onData((data) => {
      window.orca.pty.write(sessionId, data);
    });

    const unsubExit = window.orca.pty.onExit(sessionId, (exitCode) => {
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
    });

    // Use ResizeObserver for both initial fit+replay and subsequent resizes.
    // The first callback fires after the browser has completed layout, guaranteeing
    // correct container dimensions — unlike rAF which can fire before flex layout stabilizes.
    let initialFitDone = false;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (!initialFitDone) {
        // First callback: fit immediately (no debounce), resize PTY, then replay
        initialFitDone = true;
        fitAndResize(fitAddon, terminal, sessionId);
        window.orca.pty.replay(sessionId).then((output) => {
          if (output) terminal.write(output);
        });
        return;
      }
      // Subsequent callbacks: debounce for resize stability
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        fitAndResize(fitAddon, terminal, sessionId);
      }, 100);
    });
    resizeObserver.observe(container);

    // Periodically serialize terminal state for persistence.
    // Serialized snapshots capture exactly what the user sees (cursor, colors, styles)
    // and are more compact and robust than replaying raw PTY chunks.
    let lastSnapshot = '';
    const sendSnapshot = () => {
      try {
        const serialized = serializeAddon.serialize();
        if (serialized && serialized !== lastSnapshot) {
          lastSnapshot = serialized;
          window.orca.pty.snapshot(sessionId, serialized);
        }
      } catch {
        // Addon may not be ready if terminal hasn't fully initialized
      }
    };
    const SNAPSHOT_INTERVAL_MS = 5_000;
    const snapshotTimer = setInterval(sendSnapshot, SNAPSHOT_INTERVAL_MS);

    // Update terminal theme when color scheme changes (media query or class toggle)
    const handleColorSchemeChange = () => {
      terminal.options.theme = readTerminalTheme();
    };
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    colorSchemeQuery.addEventListener('change', handleColorSchemeChange);

    // Also watch for class changes on <html> (light/dark forced via preferences)
    const classObserver = new MutationObserver(handleColorSchemeChange);
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      setSearchVisible(false);
      clearInterval(snapshotTimer);
      sendSnapshot();
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      colorSchemeQuery.removeEventListener('change', handleColorSchemeChange);
      classObserver.disconnect();
      webglAddon?.dispose();
      serializeAddon.dispose();
      searchAddon.dispose();
      onDataDisposable.dispose();
      unsubData();
      unsubExit();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [sessionId]);

  const handleSearchClose = () => {
    setSearchVisible(false);
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  };

  // Apply font changes live
  useEffect(() => {
    fontRef.current = terminalFontFamily;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (terminal) {
      terminal.options.fontFamily = terminalFontFamily;
      if (fitAddon) {
        fitAndResize(fitAddon, terminal, sessionId);
      }
    }
  }, [terminalFontFamily]);

  return (
    <div className="relative h-full w-full" data-testid="agent-terminal">
      {searchVisible && searchAddonRef.current && (
        <TerminalSearchBar searchAddon={searchAddonRef.current} onClose={handleSearchClose} />
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ backgroundColor: 'var(--color-terminal-bg)' }}
      />
    </div>
  );
}
