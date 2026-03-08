import type { TerminalSessionInfo } from '../../hooks/useTerminalSessions.js';
import { type SessionStatus, statusDotClass } from '../../../shared/session-status.js';

interface TerminalTabsProps {
  sessions: TerminalSessionInfo[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
}

export function TerminalTabs({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
}: TerminalTabsProps) {
  return (
    <div
      className="flex overflow-x-auto flex-nowrap border-b border-gray-800 bg-gray-900"
      data-testid="terminal-tabs"
    >
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const dotClass = statusDotClass[session.status as SessionStatus] ?? 'bg-gray-500';

        return (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`flex items-center gap-2 px-3 py-1.5 text-label-sm font-medium whitespace-nowrap border-r border-gray-800 transition-colors ${
              isActive ? 'bg-gray-800 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
            }`}
            data-testid={`terminal-tab-${session.id}`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
              data-testid={`status-dot-${session.id}`}
            />
            <span>
              {session.task_id ? `Task ${session.task_id.slice(0, 8)}` : session.id.slice(0, 8)}
            </span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(session.id);
              }}
              className="ml-1 text-gray-500 hover:text-gray-200 transition-colors"
              data-testid={`close-tab-${session.id}`}
            >
              &times;
            </span>
          </button>
        );
      })}
    </div>
  );
}
