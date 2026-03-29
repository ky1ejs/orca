import { type MutableRefObject, memo, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { SerializeAddon } from '@xterm/addon-serialize';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { usePreferences } from '../../preferences/context.js';
import { TerminalSearchBar } from './TerminalSearchBar.js';
import { createPerfTimer, rendererPerfLog } from '../../../shared/perf.js';
import { isActiveSessionStatus } from '../../../shared/session-status.js';
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

/** Try loading CanvasAddon as intermediate fallback between WebGL and DOM. */
function tryLoadCanvas(terminal: Terminal, ref: MutableRefObject<CanvasAddon | null>): void {
  let canvas: CanvasAddon | null = null;
  try {
    canvas = new CanvasAddon();
    terminal.loadAddon(canvas);
    ref.current = canvas;
  } catch {
    canvas?.dispose();
    ref.current = null;
  }
}

interface AgentTerminalProps {
  sessionId: string;
  /** Whether this terminal is the active/visible tab. */
  visible: boolean;
  /** Session status — used to defer xterm init for dead sessions until viewed. */
  status: string;
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
  status,
}: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const canvasAddonRef = useRef<CanvasAddon | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { terminalFontFamily } = usePreferences();
  const fontRef = useRef(terminalFontFamily);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Lazy initialization latch: defer xterm creation for dead sessions that
  // aren't visible. Once initialized, stays true for the component's lifetime
  // — no teardown-and-recreate cycle that would leak unACKed flow control bytes.
  const [initialized, setInitialized] = useState(() => visible || isActiveSessionStatus(status));

  useEffect(() => {
    if (visible || isActiveSessionStatus(status)) {
      setInitialized(true);
    }
  }, [visible, status]);

  useEffect(() => {
    if (!initialized) return;
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let unsubData: (() => void) | null = null;
    let lastRefreshAt = -REFRESH_THROTTLE_MS;
    let firstDataLogged = false;
    /** Bytes passed to terminal.write() whose ACK callback hasn't fired yet. */
    let inFlightBytes = 0;

    const mark = createPerfTimer(`terminal(${sessionId})`, rendererPerfLog);

    const terminal = new Terminal({
      theme: readTerminalTheme(),
      fontFamily: fontRef.current,
      fontSize: 13,
      cursorBlink: true,
      // PTY onlcr covers live stream, but direct writes and serialized snapshots
      // may contain lone \n — convertEol handles those edge cases safely.
      convertEol: true,
      scrollback: 5_000,
      minimumContrastRatio: 4.5, // WCAG AA — ensures dim ANSI colors remain readable
      allowProposedApi: true, // Required by CanvasAddon and SearchAddon decorations
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = '11';

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

    // Write coalescing: buffer incoming PTY data and flush via rAF so
    // xterm.js processes one batched write per frame instead of many small
    // ones. The write callback ACKs back to the daemon for end-to-end
    // flow control (daemon pauses PTY when unacked data exceeds watermark).
    let pendingData = '';
    let writeRafId: number | null = null;

    /** Replay the session buffer and subscribe to live data. Idempotent. */
    async function replayAndSubscribe(): Promise<void> {
      unsubData?.();
      unsubData = null;

      try {
        const output = await window.orca.pty.replay(sessionId);
        if (disposed) return;
        mark('replay-complete');
        if (output) {
          terminal.write(output, () => {
            window.orca.pty.ack(sessionId, output.length);
          });
        }
      } catch {
        if (disposed) return;
        // Replay failed (daemon busy/disconnected) — proceed without history.
        // Live data will still flow once the subscription is established.
      }

      // Always subscribe regardless of replay success — subscribing synchronously
      // after the await ensures no IPC gap between the buffer end and live stream.
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
            inFlightBytes += batch.length;
            terminal.write(batch, () => {
              inFlightBytes -= batch.length;
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
    }

    // Re-replay and re-subscribe after daemon disconnect/reconnect to recover
    // any output produced during the gap.
    const unsubReconnect = window.orca.lifecycle.onDaemonReconnected(() => {
      if (disposed || !initialFitDone) return;
      // Cancel any pending write rAF and ACK buffered data before resetting.
      // Without this, the stale rAF callback could fire after reset and write
      // pre-reconnect data into the freshly cleared terminal.
      if (writeRafId !== null) {
        cancelAnimationFrame(writeRafId);
        writeRafId = null;
      }
      const unleaked = pendingData.length + inFlightBytes;
      pendingData = '';
      inFlightBytes = 0;
      if (unleaked > 0) {
        window.orca.pty.ack(sessionId, unleaked);
      }
      terminal.reset();
      void replayAndSubscribe();
    });

    // PTY output subscription is DEFERRED to after initial fit + replay.
    // Subscribing immediately would write data at wrong dimensions (default 80x24)
    // and duplicate content when replay() returns the full buffer.
    let initialFitDone = false;
    let resizeRafId: number | null = null;

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
        void replayAndSubscribe();
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
        // Include scrollback so the full output history survives unmount/remount
        // (e.g. navigating away from a task and back). Without this, only the
        // visible viewport (~30 rows) would be restored on replay.
        const scrollback = terminal.buffer.active.length - terminal.rows;
        const serialized = serializeAddon.serialize({
          scrollback: Math.max(0, scrollback),
        });
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
      // ACK any buffered or in-flight data directly so the daemon's
      // unackedSize doesn't stay inflated. We can't rely on
      // terminal.write()'s async callback because terminal.dispose()
      // below would prevent it from firing.
      const unleakedBytes = pendingData.length + inFlightBytes;
      pendingData = '';
      inFlightBytes = 0;
      if (unleakedBytes > 0) {
        window.orca.pty.ack(sessionId, unleakedBytes);
      }
      resizeObserver.disconnect();
      colorSchemeQuery.removeEventListener('change', handleColorSchemeChange);
      classObserver.disconnect();
      webglAddonRef.current?.dispose();
      webglAddonRef.current = null;
      canvasAddonRef.current?.dispose();
      canvasAddonRef.current = null;
      serializeAddon.dispose();
      searchAddon.dispose();
      onDataDisposable.dispose();
      unsubData?.();
      unsubExit();
      unsubReconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [sessionId, initialized]);

  const handleSearchClose = () => {
    setSearchVisible(false);
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  };

  // Renderer lifecycle: WebGL → Canvas → DOM fallback cascade.
  // Must be declared after the main xterm effect — on first initialization both
  // effects fire in the same commit and this one reads terminalRef.current.
  //
  // Immediate creation avoids the 5-20ms latency of recreating on every tab
  // switch. The 5s delay before disposal means rapid switching tends to keep
  // contexts alive, while idle hidden terminals eventually free GPU resources —
  // helping stay within the browser's ~8-16 context limit in typical workloads,
  // but without a strict global cap across all sessions.
  //
  // Also refits and focuses on visibility change since ResizeObserver won't fire
  // on visibility: hidden → visible (element size doesn't change).
  useEffect(() => {
    if (!initialized) return;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    if (visible) {
      if (!webglAddonRef.current && !canvasAddonRef.current) {
        try {
          const addon = new WebglAddon();
          webglAddonRef.current = addon;
          addon.onContextLoss(() => {
            if (webglAddonRef.current === addon) {
              webglAddonRef.current = null;
            }
            addon.dispose();
            // Immediately try Canvas so the user doesn't see a flash to DOM
            tryLoadCanvas(terminal, canvasAddonRef);
          });
          terminal.loadAddon(addon);
        } catch {
          webglAddonRef.current = null;
          // WebGL failed — try Canvas as intermediate fallback before DOM
          tryLoadCanvas(terminal, canvasAddonRef);
        }
      }

      fitAndResize(fitAddon, terminal, sessionId);
      terminal.focus();
      return;
    }

    // Release GPU renderers after a delay so rapid tab switching doesn't
    // pay the creation cost, but idle hidden terminals free resources.
    const disposeTimer = setTimeout(() => {
      const webgl = webglAddonRef.current;
      if (webgl) {
        webglAddonRef.current = null;
        webgl.dispose();
      }
      const canvas = canvasAddonRef.current;
      if (canvas) {
        canvasAddonRef.current = null;
        canvas.dispose();
      }
    }, 5_000);
    return () => clearTimeout(disposeTimer);
  }, [visible, sessionId, initialized]);

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
    if (!initialized) return;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (terminal) {
      terminal.options.fontFamily = terminalFontFamily;
      if (fitAddon) {
        fitAndResize(fitAddon, terminal, sessionId);
      }
    }
  }, [terminalFontFamily, sessionId, initialized]);

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
