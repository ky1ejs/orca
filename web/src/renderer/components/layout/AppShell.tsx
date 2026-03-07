import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar.js';
import { useNavigation } from '../../navigation/context.js';
import { ProjectList } from '../projects/ProjectList.js';
import { ProjectDetail } from '../projects/ProjectDetail.js';
import { TaskDetail } from '../tasks/TaskDetail.js';
import { useTerminalSessions } from '../../hooks/useTerminalSessions.js';
import { AgentTerminal } from '../terminal/AgentTerminal.js';
import { TerminalTabs } from '../terminal/TerminalTabs.js';

function MainContent() {
  const { current } = useNavigation();

  switch (current.view) {
    case 'projects':
      return <ProjectList />;
    case 'project':
      return current.id ? <ProjectDetail projectId={current.id} /> : <ProjectList />;
    case 'task':
      return current.id ? <TaskDetail taskId={current.id} /> : <ProjectList />;
    default:
      return <ProjectList />;
  }
}

export function AppShell() {
  const { current } = useNavigation();
  const taskId = current.view === 'task' ? current.id : undefined;
  const { sessions, refresh } = useTerminalSessions(taskId);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Auto-select most recent active session when navigating to a task
  useEffect(() => {
    if (sessions.length > 0) {
      const active = sessions.find(
        (s) =>
          s.status === 'RUNNING' || s.status === 'STARTING' || s.status === 'WAITING_FOR_INPUT',
      );
      setActiveSessionId(active?.id ?? sessions[0].id);
    } else {
      setActiveSessionId(null);
    }
  }, [taskId, sessions.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      await window.orca.pty.kill(sessionId);
      refresh();
    },
    [refresh],
  );

  const hasActiveSessions = sessions.length > 0;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <MainContent />
        </main>
        {hasActiveSessions && (
          <div className="h-80 border-t border-gray-800 flex flex-col">
            <TerminalTabs
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSessionId}
              onCloseSession={handleCloseSession}
            />
            <div className="flex-1 overflow-hidden">
              {activeSessionId && <AgentTerminal sessionId={activeSessionId} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
