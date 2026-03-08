import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { usePreferences } from '../../preferences/context.js';
import '@xterm/xterm/css/xterm.css';

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
      theme: {
        background: '#030712',
        foreground: '#e5e7eb',
        cursor: '#e5e7eb',
        selectionBackground: '#374151',
      },
      fontFamily: fontRef.current,
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Replay existing output
    window.orca.pty.replay(sessionId).then((output) => {
      if (output) terminal.write(output);
    });

    // Subscribe to live output
    const unsubData = window.orca.pty.onData(sessionId, (data) => {
      terminal.write(data);
    });

    // Send user keyboard input to PTY
    const onDataDisposable = terminal.onData((data) => {
      window.orca.pty.write(sessionId, data);
    });

    // Handle PTY exit
    const unsubExit = window.orca.pty.onExit(sessionId, (exitCode) => {
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
    });

    // Resize observer
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
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

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
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
      style={{ backgroundColor: '#030712' }}
    />
  );
}
