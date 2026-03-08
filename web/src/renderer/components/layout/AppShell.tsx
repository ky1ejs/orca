import { useState, useEffect, useCallback, useMemo } from 'react';
import { isActiveSessionStatus } from '../../../shared/session-status.js';
import { Sidebar } from './Sidebar.js';
import { useNavigation } from '../../navigation/context.js';
import { ProjectList } from '../projects/ProjectList.js';
import { ProjectDetail } from '../projects/ProjectDetail.js';
import { TaskDetail } from '../tasks/TaskDetail.js';
import { WorkspaceSettings } from '../settings/WorkspaceSettings.js';
import { useWorkspaceBySlug, usePendingInvitations } from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';
import { useTerminalSessions } from '../../hooks/useTerminalSessions.js';
import { AgentTerminal } from '../terminal/AgentTerminal.js';
import { TerminalTabs } from '../terminal/TerminalTabs.js';
import { OnboardingFlow } from '../onboarding/OnboardingFlow.js';
import { PendingInvitations } from '../onboarding/PendingInvitations.js';
import { KeyboardShortcutHelp } from './KeyboardShortcutHelp.js';
import { EmptyTerminalArea } from './EmptyState.js';
import { useKeyboardShortcuts, type ShortcutDefinition } from '../../hooks/useKeyboardShortcuts.js';

interface AppShellProps {
  onLogout: () => void;
}

function MainContent() {
  const { current } = useNavigation();

  switch (current.view) {
    case 'projects':
      return <ProjectList />;
    case 'project':
      return current.id ? <ProjectDetail projectId={current.id} /> : <ProjectList />;
    case 'task':
      return current.id ? <TaskDetail taskId={current.id} /> : <ProjectList />;
    case 'settings':
    case 'members':
      return <WorkspaceSettings />;
    default:
      return <ProjectList />;
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
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [invitationsDismissed, setInvitationsDismissed] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const { data: invitationsData, fetching: invitationsFetching } = usePendingInvitations();

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

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      await window.orca.pty.kill(sessionId);
      await window.orca.db.deleteSession(sessionId);
      refresh();
    },
    [refresh],
  );

  // Determine if we should show pending invitations
  const pendingInvitations = invitationsData?.pendingInvitations ?? [];
  const showInvitations =
    !invitationsFetching && pendingInvitations.length > 0 && !invitationsDismissed;

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
            navigate({ view: 'project', id: current.id });
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

  if (showInvitations) {
    return (
      <div className="flex h-screen bg-gray-950 text-gray-100">
        <PendingInvitations
          invitations={pendingInvitations}
          onComplete={() => setInvitationsDismissed(true)}
        />
        <KeyboardShortcutHelp
          shortcuts={displayShortcuts}
          isOpen={showShortcutHelp}
          onClose={() => setShowShortcutHelp(false)}
        />
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="flex h-screen bg-gray-950 text-gray-100">
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
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onLogout={onLogout}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {updateVersion && (
          <div className="bg-blue-600 text-white px-4 py-2 text-sm flex items-center justify-between shrink-0">
            <span>Orca v{updateVersion} is ready to install.</span>
            <button
              onClick={() => window.orca.updates.install()}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              Restart &amp; Update
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          <MainContent />
        </main>
        {current.view === 'task' && (
          <div className="h-80 border-t border-gray-800 flex flex-col">
            {hasActiveSessions ? (
              <>
                <TerminalTabs
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSelectSession={setActiveSessionId}
                  onCloseSession={handleCloseSession}
                />
                <div className="flex-1 overflow-hidden">
                  {activeSessionId && <AgentTerminal sessionId={activeSessionId} />}
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
    </div>
  );
}
