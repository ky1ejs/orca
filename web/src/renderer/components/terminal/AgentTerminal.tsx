import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { usePreferences } from '../../preferences/context.js';
import '@xterm/xterm/css/xterm.css';

function readTerminalTheme() {
  const s = getComputedStyle(document.documentElement);
  return {
    background: s.getPropertyValue('--color-terminal-bg').trim() || '#0e0d0c',
    foreground: s.getPropertyValue('--color-terminal-fg').trim() || '#ccc9c3',
    cursor: s.getPropertyValue('--color-terminal-cursor').trim() || '#ccc9c3',
    selectionBackground: s.getPropertyValue('--color-terminal-selection').trim() || '#37352f',
  };
}

interface AgentTerminalProps {
  sessionId: string;
}

export function AgentTerminal({ sessionId }: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
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
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(container);

    // Intercept Shift+Enter to send CSI u encoding (\x1b[13;2u) instead of
    // plain \r so Claude Code can distinguish it and insert a newline.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.key === 'Enter' && event.shiftKey) {
        window.orca.pty.write(sessionId, '\x1b[13;2u');
        return false;
      }
      return true;
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

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
        try {
          fitAddon.fit();
          window.orca.pty.resize(sessionId, terminal.cols, terminal.rows);
        } catch {
          // Container may have been removed
        }
        window.orca.pty.replay(sessionId).then((output) => {
          if (output) terminal.write(output);
        });
        return;
      }
      // Subsequent callbacks: debounce for resize stability
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        try {
          fitAddon.fit();
          window.orca.pty.resize(sessionId, terminal.cols, terminal.rows);
        } catch {
          // Container may have been removed
        }
      }, 100);
    });
    resizeObserver.observe(container);

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
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      colorSchemeQuery.removeEventListener('change', handleColorSchemeChange);
      classObserver.disconnect();
      onDataDisposable.dispose();
      unsubData();
      unsubExit();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  // Apply font changes live
  useEffect(() => {
    fontRef.current = terminalFontFamily;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (terminal) {
      terminal.options.fontFamily = terminalFontFamily;
      if (fitAddon) {
        try {
          fitAddon.fit();
          window.orca.pty.resize(sessionId, terminal.cols, terminal.rows);
        } catch {
          // Container may have been removed
        }
      }
    }
  }, [terminalFontFamily]);

  return (
    <div
      ref={containerRef}
      data-testid="agent-terminal"
      className="h-full w-full"
      style={{ backgroundColor: 'var(--color-terminal-bg)' }}
    />
  );
}
