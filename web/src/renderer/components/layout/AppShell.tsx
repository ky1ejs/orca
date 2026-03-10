import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { isActiveSessionStatus } from '../../../shared/session-status.js';
import { Sidebar } from './Sidebar.js';
import { useNavigation } from '../../navigation/context.js';
import { InitiativeList } from '../initiatives/InitiativeList.js';
import { InitiativeDetail } from '../initiatives/InitiativeDetail.js';
import { ProjectList } from '../projects/ProjectList.js';
import { ProjectDetail } from '../projects/ProjectDetail.js';
import { TaskDetail } from '../tasks/TaskDetail.js';
import { WorkspaceSettings } from '../settings/WorkspaceSettings.js';
import { useWorkspaceBySlug } from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';
import { useTerminalSessions } from '../../hooks/useTerminalSessions.js';
import { AgentTerminal } from '../terminal/AgentTerminal.js';
import { TerminalTabs } from '../terminal/TerminalTabs.js';
import { OnboardingFlow } from '../onboarding/OnboardingFlow.js';
import { KeyboardShortcutHelp } from './KeyboardShortcutHelp.js';
import { EmptyTerminalArea } from './EmptyState.js';
import { Breadcrumbs } from './Breadcrumbs.js';
import { useKeyboardShortcuts, type ShortcutDefinition } from '../../hooks/useKeyboardShortcuts.js';
import { QuickCreateTask } from '../tasks/QuickCreateTask.js';
import { useSessionActivity } from '../../hooks/useSessionActivity.js';

interface AppShellProps {
  onLogout: () => void;
}

function MainContent() {
  const { current } = useNavigation();

  switch (current.view) {
    case 'initiatives':
      return <InitiativeList />;
    case 'initiative':
      return current.id ? <InitiativeDetail initiativeId={current.id} /> : <InitiativeList />;
    case 'projects':
      return <ProjectList />;
    case 'project':
      return current.id ? <ProjectDetail projectId={current.id} /> : <InitiativeList />;
    case 'task':
      return current.id ? <TaskDetail taskId={current.id} /> : <InitiativeList />;
    case 'settings':
    case 'members':
      return <WorkspaceSettings />;
    default:
      return <InitiativeList />;
  }
}

export function AppShell({ onLogout }: AppShellProps) {
  const { current, navigate } = useNavigation();
  const { currentWorkspace, loading: workspaceLoading } = useWorkspace();
  const { data: workspaceData, fetching: projectsFetching } = useWorkspaceBySlug(
    currentWorkspace?.slug ?? '',
  );
  const taskId = current.view === 'task' ? current.id : undefined;
  const { sessions, refresh } = useTerminalSessions(taskId);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const activeSessionIds = useSessionActivity();

  // Reset active session when navigating to a different task
  useEffect(() => {
    setActiveSessionId(null);
  }, [taskId]);

  // Auto-select session when none is selected or current selection is invalid
  useEffect(() => {
    if (activeSessionId && sessions.some((s) => s.id === activeSessionId)) {
      return; // Current selection is valid, don't override manual tab choice
    }
    if (sessions.length > 0) {
      const active = sessions.find((s) => isActiveSessionStatus(s.status));
      setActiveSessionId(active?.id ?? sessions[0].id);
    } else {
      setActiveSessionId(null);
    }
  }, [sessions, activeSessionId]);

  // Listen for auto-update readiness
  useEffect(() => {
    if (!window.orca?.updates) return;
    return window.orca.updates.onUpdateReady((version) => {
      setUpdateVersion(version);
    });
  }, []);

  // Listen for auto-update errors
  useEffect(() => {
    if (!window.orca?.updates?.onUpdateError) return;
    return window.orca.updates.onUpdateError((message) => {
      console.error('[updater] Error:', message);
    });
  }, []);

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      await window.orca.pty.kill(sessionId);
      await window.orca.db.deleteSession(sessionId);
      refresh();
    },
    [refresh],
  );

  // Determine if we should show the onboarding flow
  const projects = workspaceData?.workspace?.projects ?? [];
  const showOnboarding =
    !workspaceLoading && !projectsFetching && projects.length === 0 && !onboardingDismissed;

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingDismissed(true);
  }, []);

  // Keyboard shortcut definitions
  const shortcuts: ShortcutDefinition[] = useMemo(
    () => [
      {
        key: 'n',
        metaKey: true,
        shiftKey: true,
        label: 'New Project',
        description: 'Create a new project',
        action: () => {
          navigate({ view: 'projects' });
        },
      },
      {
        key: 'n',
        metaKey: true,
        label: 'New Task',
        description: 'New task in current project',
        action: () => {
          if (current.view === 'project' && current.id) {
            // Already on project view, the ProjectDetail will handle it
            navigate({ view: 'project', id: current.id, projectName: current.projectName });
          }
        },
      },
      {
        key: 't',
        metaKey: true,
        label: 'New Terminal',
        description: 'New standalone terminal',
        action: () => {
          // Standalone terminal — no-op if window.orca not available
        },
      },
      {
        key: 'Enter',
        metaKey: true,
        label: 'Open Terminal',
        description: 'Open or restart terminal for current task',
        action: () => {
          if (current.view === 'task' && current.id) {
            const agentButton = document.querySelector<HTMLButtonElement>(
              '[data-testid="agent-button"]',
            );
            if (agentButton && !agentButton.disabled) {
              agentButton.click();
            }
          }
        },
      },
      {
        key: 'w',
        metaKey: true,
        label: 'Close Tab',
        description: 'Close current terminal tab',
        action: () => {
          if (activeSessionId) {
            handleCloseSession(activeSessionId);
          }
        },
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        key: String(i + 1),
        metaKey: true,
        label: `Tab ${i + 1}`,
        description: `Switch to terminal tab ${i + 1}`,
        action: () => {
          if (sessions.length > i) {
            setActiveSessionId(sessions[i].id);
          }
        },
      })),
      {
        key: 'c',
        label: 'Quick Create Task',
        description: 'Create a task from anywhere',
        action: () => {
          setShowQuickCreate(true);
        },
      },
      {
        key: '/',
        metaKey: true,
        label: 'Help',
        description: 'Show keyboard shortcuts',
        action: () => {
          setShowShortcutHelp((prev) => !prev);
        },
      },
      {
        key: '?',
        label: 'Help',
        description: 'Show keyboard shortcuts',
        action: () => {
          setShowShortcutHelp((prev) => !prev);
        },
      },
    ],
    [current, navigate, activeSessionId, handleCloseSession, sessions],
  );

  useKeyboardShortcuts({ shortcuts });

  // Filter shortcuts for the help modal (exclude duplicate "?" and tab 2-9)
  const displayShortcuts = shortcuts.filter(
    (s) =>
      s.key !== '?' && !(s.metaKey && ['2', '3', '4', '5', '6', '7', '8', '9'].includes(s.key)),
  );

  const hasActiveSessions = sessions.length > 0;

  if (showOnboarding) {
    return (
      <div className="flex h-screen bg-surface text-fg">
        <OnboardingFlow onComplete={handleOnboardingComplete} />
        <KeyboardShortcutHelp
          shortcuts={displayShortcuts}
          isOpen={showShortcutHelp}
          onClose={() => setShowShortcutHelp(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface text-fg">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onLogout={onLogout}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {updateVersion && (
          <div className="bg-surface-overlay border-b border-edge-subtle text-fg px-4 py-2 text-body-sm flex items-center justify-between shrink-0">
            <span>Orca v{updateVersion} is ready to install.</span>
            <button
              onClick={() => window.orca.updates.install()}
              className="bg-accent hover:bg-accent-hover text-on-accent px-3 py-1 rounded text-label-sm font-medium transition-colors"
            >
              <Download className={`${iconSize.sm} mr-1 inline-block`} />
              Restart &amp; Update
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          <Breadcrumbs />
          <MainContent />
        </main>
        {current.view === 'task' && (
          <div className="h-80 shrink-0 border-t border-edge flex flex-col">
            {hasActiveSessions ? (
              <>
                <TerminalTabs
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  activeSessionIds={activeSessionIds}
                  onSelectSession={setActiveSessionId}
                  onCloseSession={handleCloseSession}
                />
                <div className="flex-1 overflow-hidden">
                  {activeSessionId && (
                    <AgentTerminal key={activeSessionId} sessionId={activeSessionId} />
                  )}
                </div>
              </>
            ) : (
              <EmptyTerminalArea />
            )}
          </div>
        )}
      </div>
      <KeyboardShortcutHelp
        shortcuts={displayShortcuts}
        isOpen={showShortcutHelp}
        onClose={() => setShowShortcutHelp(false)}
      />
      <QuickCreateTask
        isOpen={showQuickCreate}
        onClose={() => setShowQuickCreate(false)}
        projects={projects}
      />
    </div>
  );
}
