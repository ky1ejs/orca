import { memo, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { SerializeAddon } from '@xterm/addon-serialize';
import { SearchAddon } from '@xterm/addon-search';
import { usePreferences } from '../../preferences/context.js';
import { TerminalSearchBar } from './TerminalSearchBar.js';
import { createPerfTimer, rendererPerfLog } from '../../../shared/perf.js';
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

const DANGEROUS_CHARS = /[`$|&>~#!^*;<]/g;

/** Modeled on VS Code's `escapeNonWindowsPath()`. */
export function escapeFilePath(p: string): string {
  const sanitized = p.replace(DANGEROUS_CHARS, '');
  if (/^[a-zA-Z0-9_./:@-]+$/.test(sanitized)) return sanitized;
  return "'" + sanitized.replace(/'/g, "'\\''") + "'";
}

/** How often (ms) to force a full re-render during active PTY output. */
const REFRESH_THROTTLE_MS = 1_000;

interface AgentTerminalProps {
  sessionId: string;
  /** Whether this terminal is the active/visible tab. */
  visible: boolean;
}

/** Fit the terminal to its container and sync the PTY dimensions. */
function fitAndResize(fitAddon: FitAddon, terminal: Terminal, sessionId: string): void {
  try {
    const dims = fitAddon.proposeDimensions();
    if (!dims || isNaN(dims.cols) || isNaN(dims.rows)) return;

    if (dims.cols !== terminal.cols || dims.rows !== terminal.rows) {
      // Preserve scroll position across resize — fit() calls _renderService.clear()
      // + terminal.resize() which can reset the viewport scroll offset.
      // Use a 1-row threshold: during active output with scroll regions, baseY can
      // advance by one row between reading viewportY and the reflow.
      const buffer = terminal.buffer.active;
      const wasAtBottom = buffer.viewportY >= buffer.baseY - 1;

      fitAddon.fit();
      if (terminal.cols > 0 && terminal.rows > 0) {
        window.orca.pty.resize(sessionId, terminal.cols, terminal.rows);
      }

      if (wasAtBottom) {
        terminal.scrollToBottom();
      }
    }

    // Always force a full re-render to clear accumulated rendering artifacts
    // (e.g. WebGL state drift), even when terminal dimensions haven't changed.
    // Layout reflows from sibling component re-renders can disturb the renderer
    // without changing the terminal's col/row count.
    terminal.refresh(0, terminal.rows - 1);
  } catch {
    // Container may have been removed or have zero dimensions
  }
}

export const AgentTerminal = memo(function AgentTerminal({
  sessionId,
  visible,
}: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { terminalFontFamily } = usePreferences();
  const fontRef = useRef(terminalFontFamily);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let unsubData: (() => void) | null = null;
    let lastRefreshAt = -REFRESH_THROTTLE_MS;
    let firstDataLogged = false;

    const mark = createPerfTimer(`terminal(${sessionId})`, rendererPerfLog);

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
    mark('xterm-opened');

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

    const onDataDisposable = terminal.onData((data) => {
      window.orca.pty.write(sessionId, data);
    });

    const unsubExit = window.orca.pty.onExit(sessionId, (exitCode) => {
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
    });

    // PTY output subscription is DEFERRED to after initial fit + replay.
    // Subscribing immediately would write data at wrong dimensions (default 80x24)
    // and duplicate content when replay() returns the full buffer.
    let initialFitDone = false;
    let resizeRafId: number | null = null;

    // Write coalescing: buffer incoming PTY data and flush via rAF so
    // xterm.js processes one batched write per frame instead of many small
    // ones. The write callback ACKs back to the daemon for end-to-end
    // flow control (daemon pauses PTY when unacked data exceeds watermark).
    let pendingData = '';
    let writeRafId: number | null = null;

    // ResizeObserver fires after layout completes, guaranteeing correct container
    // dimensions — unlike rAF which can fire before flex layout stabilizes.
    const resizeObserver = new ResizeObserver((entries) => {
      if (disposed) return;
      const entry = entries[0];
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) {
        return;
      }

      if (!initialFitDone) {
        initialFitDone = true;
        fitAndResize(fitAddon, terminal, sessionId);
        mark('fit-complete');
        window.orca.pty.replay(sessionId).then((output) => {
          if (disposed) return;
          mark('replay-complete');
          if (output) {
            terminal.write(output, () => {
              window.orca.pty.ack(sessionId, output.length);
            });
          }
          // Subscribe to live PTY output AFTER fit + replay completes.
          // JS event loop guarantees no IPC events dispatch between the
          // promise resolution and this synchronous listener registration.
          unsubData = window.orca.pty.onData(sessionId, (data) => {
            if (disposed) return;
            if (!firstDataLogged) {
              firstDataLogged = true;
              mark('first-data');
            }
            pendingData += data;
            if (writeRafId === null) {
              writeRafId = requestAnimationFrame(() => {
                writeRafId = null;
                const batch = pendingData;
                pendingData = '';
                terminal.write(batch, () => {
                  window.orca.pty.ack(sessionId, batch.length);
                });
                // Throttled full re-render to clear accumulated WebGL rendering
                // artifacts. The rAF coalescing already limits this to once per
                // frame; the 1 Hz throttle avoids unnecessary GPU work beyond that.
                const now = performance.now();
                if (visibleRef.current && now - lastRefreshAt >= REFRESH_THROTTLE_MS) {
                  lastRefreshAt = now;
                  terminal.refresh(0, terminal.rows - 1);
                }
              });
            }
          });
        });
        return;
      }
      // Skip resize IPC for hidden terminals — only the visible one needs to
      // refit and sync PTY dimensions. Hidden terminals refit when they become visible.
      if (!visibleRef.current) return;
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        fitAndResize(fitAddon, terminal, sessionId);
      });
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
      disposed = true;
      if (!firstDataLogged) {
        mark('disposed-before-data');
      }
      setSearchVisible(false);
      clearInterval(snapshotTimer);
      sendSnapshot();
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      if (writeRafId !== null) cancelAnimationFrame(writeRafId);
      // Flush any remaining buffered data before disposal and ACK it
      // so the daemon's unackedSize doesn't stay inflated.
      if (pendingData) {
        const flushed = pendingData;
        pendingData = '';
        terminal.write(flushed, () => {
          window.orca.pty.ack(sessionId, flushed.length);
        });
      }
      resizeObserver.disconnect();
      colorSchemeQuery.removeEventListener('change', handleColorSchemeChange);
      classObserver.disconnect();
      serializeAddon.dispose();
      searchAddon.dispose();
      onDataDisposable.dispose();
      unsubData?.();
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

  // Manage WebGL addon lifecycle based on visibility. Only the active terminal
  // gets a WebGL context — hidden terminals fall back to the default renderer.
  // This prevents "Too many active WebGL contexts" warnings when many sessions
  // are mounted simultaneously (browsers limit to ~8-16 contexts).
  useEffect(() => {
    // terminalRef and fitAddonRef are populated by the setup effect above,
    // which runs first (React executes effects in declaration order).
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    const disposeWebgl = (addonToDispose?: WebglAddon | null) => {
      const addon = addonToDispose ?? webglAddonRef.current;
      if (!addon) return;
      if (webglAddonRef.current === addon) {
        webglAddonRef.current = null;
      }
      addon.dispose();
    };

    if (visible) {
      try {
        const addon = new WebglAddon();
        // Set the ref before loading so context loss during load can still dispose it.
        webglAddonRef.current = addon;
        addon.onContextLoss(() => disposeWebgl(addon));
        terminal.loadAddon(addon);
      } catch {
        webglAddonRef.current = null;
      }

      // Refit after loading WebGL — ResizeObserver won't fire on
      // visibility: hidden → visible since element size doesn't change.
      fitAndResize(fitAddon, terminal, sessionId);
    }

    return () => disposeWebgl();
  }, [visible, sessionId]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragOver) setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const terminal = terminalRef.current;
    if (!terminal) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const paths = files
      .map((file) => file.path)
      .filter((p) => p)
      .map(escapeFilePath)
      .join(' ');

    if (paths) {
      terminal.paste(paths);
    }
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
    <div
      className="absolute inset-0"
      data-testid="agent-terminal"
      style={{
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {searchVisible && searchAddonRef.current && (
        <TerminalSearchBar searchAddon={searchAddonRef.current} onClose={handleSearchClose} />
      )}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-accent/10 text-body-sm text-fg-muted">
          Drop files to paste path
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ backgroundColor: 'var(--color-terminal-bg)' }}
      />
    </div>
  );
});
