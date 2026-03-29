import { useState, useEffect, useRef } from 'react';
import { createPerfTimer, rendererPerfLog } from '../../../shared/perf.js';
import { SquareTerminal, RotateCcw, ChevronDown, Sparkles, Check, Square } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { AgentStatus } from '../terminal/AgentStatus.js';
import { useTaskHeaderControls } from './TaskHeaderContext.js';
import { useSessionActivity } from '../../hooks/useSessionActivity.js';
import { usePreferences } from '../../preferences/context.js';

export function HeaderTerminalControls() {
  const controls = useTaskHeaderControls();
  const [launching, setLaunching] = useState(false);
  const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
  const launchMenuRef = useRef<HTMLDivElement>(null);
  const { agentLaunchMode, setAgentLaunchMode } = usePreferences();
  const activeSessionIds = useSessionActivity();

  useEffect(() => {
    if (!launchMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (launchMenuRef.current && !launchMenuRef.current.contains(e.target as Node)) {
        setLaunchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [launchMenuOpen]);

  if (!controls) return null;

  const { activeSession, errorSession, projectDirectory, refreshSessions, buildMetadata, onAgentError, taskId } = controls;

  const handleLaunchAgent = async (options?: { planMode?: boolean }) => {
    if (!projectDirectory) {
      onAgentError({
        message: 'No project directory set.',
        suggestion: 'Set the project directory before launching an agent.',
      });
      return;
    }
    setLaunching(true);
    onAgentError(null);
    try {
      const mark = createPerfTimer('agent-launch', rendererPerfLog);
      const result = await window.orca.agent.launch(
        taskId,
        projectDirectory,
        options,
        buildMetadata(),
      );
      mark('ipc-complete');
      if (!result.success && result.error) {
        onAgentError({ message: result.error.message, suggestion: result.error.suggestion });
      }
      refreshSessions();
    } finally {
      setLaunching(false);
    }
  };

  const handleStopAgent = async () => {
    if (!activeSession) return;
    await window.orca.agent.stop(activeSession.id);
    refreshSessions();
  };

  const handleRestartAgent = async () => {
    if (!errorSession) return;
    if (!projectDirectory) {
      onAgentError({
        message: 'No project directory set.',
        suggestion: 'Set the project directory before restarting an agent.',
      });
      return;
    }
    setLaunching(true);
    onAgentError(null);
    try {
      const result = await window.orca.agent.restart(
        taskId,
        errorSession.id,
        projectDirectory,
        undefined,
        buildMetadata(),
      );
      if (!result.success && result.error) {
        onAgentError({ message: result.error.message, suggestion: result.error.suggestion });
      }
      refreshSessions();
    } finally {
      setLaunching(false);
    }
  };

  if (launching) {
    return (
      <div className="flex items-center px-6">
        <button
          disabled
          className="px-2.5 py-1 bg-surface-hover text-fg-muted text-label-sm rounded-md cursor-not-allowed"
          data-testid="agent-button"
        >
          Opening...
        </button>
      </div>
    );
  }

  if (activeSession) {
    return (
      <div className="flex items-center gap-2 px-6">
        <AgentStatus
          status={activeSession.status}
          active={activeSessionIds.has(activeSession.id)}
        />
        <button
          onClick={handleStopAgent}
          className="p-1.5 bg-error-muted hover:bg-error-strong text-error rounded-md transition-colors"
          data-testid="close-terminal-button"
          title="Close Terminal"
          aria-label="Close Terminal"
        >
          <Square className={iconSize.xs} />
        </button>
      </div>
    );
  }

  if (errorSession) {
    return (
      <div className="flex items-center px-6">
        <button
          onClick={handleRestartAgent}
          className="px-2.5 py-1 bg-error-muted hover:bg-error-strong text-error text-label-sm rounded-md transition-colors inline-flex items-center"
          data-testid="agent-button"
        >
          <RotateCcw className={`${iconSize.xs} mr-1`} />
          Restart
        </button>
      </div>
    );
  }

  const isPlanDefault = agentLaunchMode === 'plan';
  const colorBg = isPlanDefault
    ? 'bg-claude hover:bg-claude-hover text-on-claude'
    : 'bg-accent hover:bg-accent-hover text-on-accent';
  const chevronBorder = isPlanDefault ? 'border-claude-hover' : 'border-accent-active';
  const MainIcon = isPlanDefault ? Sparkles : SquareTerminal;
  const mainLabel = isPlanDefault ? 'Claude Plan' : 'Open Terminal';

  return (
    <div className="flex items-center px-6 relative" ref={launchMenuRef}>
      <div className="flex">
        <button
          onClick={() => handleLaunchAgent(isPlanDefault ? { planMode: true } : undefined)}
          className={`px-2.5 py-1 ${colorBg} text-label-sm rounded-l-md transition-colors inline-flex items-center`}
          data-testid="agent-button"
        >
          <MainIcon className={`${iconSize.xs} mr-1`} />
          {mainLabel}
        </button>
        <button
          onClick={() => setLaunchMenuOpen((prev) => !prev)}
          className={`px-1 py-1 ${colorBg} border-l ${chevronBorder} text-label-sm rounded-r-md transition-colors`}
          data-testid="agent-menu-toggle"
          aria-label="Terminal options"
          aria-expanded={launchMenuOpen}
          aria-haspopup="menu"
        >
          <ChevronDown className={iconSize.xs} />
        </button>
      </div>
      {launchMenuOpen && (
        <div className="absolute top-full right-0 mt-1 bg-surface-overlay border border-edge-subtle rounded-md shadow-lg z-10 min-w-[180px] animate-slide-up">
          <button
            onClick={() => {
              setLaunchMenuOpen(false);
              setAgentLaunchMode('terminal');
              handleLaunchAgent();
            }}
            className="w-full text-left px-3 py-2 text-body-sm text-fg hover:bg-surface-hover rounded-t-md transition-colors inline-flex items-center justify-between"
            data-testid="launch-terminal"
          >
            Open Terminal
            {!isPlanDefault && <Check className={iconSize.xs} />}
          </button>
          <button
            onClick={() => {
              setLaunchMenuOpen(false);
              setAgentLaunchMode('plan');
              handleLaunchAgent({ planMode: true });
            }}
            className="w-full text-left px-3 py-2 text-body-sm text-fg hover:bg-surface-hover rounded-b-md transition-colors inline-flex items-center justify-between"
            data-testid="launch-plan-mode"
          >
            Claude Plan
            {isPlanDefault && <Check className={iconSize.xs} />}
          </button>
        </div>
      )}
    </div>
  );
}
